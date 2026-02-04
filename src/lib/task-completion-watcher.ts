import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run, transaction } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';
import type { Task, Agent } from '@/lib/types';

type WatchState = {
  lastSeenSeq: Record<string, number>; // sessionKey -> last seq processed
};

const state: WatchState = {
  lastSeenSeq: {},
};

// Very small poller to detect TASK_COMPLETE in agent sessions.
// Strict mode: only mark completion if agent explicitly emits TASK_COMPLETE.
export function startTaskCompletionWatcher() {
  if ((globalThis as any).__mc_taskWatcherStarted) return;
  (globalThis as any).__mc_taskWatcherStarted = true;

  const intervalMs = Number(process.env.MC_TASK_WATCHER_INTERVAL_MS || 5000);
  console.log('[Watcher] Task completion watcher starting, interval', intervalMs, 'ms');

  setInterval(async () => {
    try {
      // Find tasks that are in progress and assigned to an agent with a session_key
      const tasks = queryAll<Task>(
        "SELECT * FROM tasks WHERE status IN ('assigned','in_progress','testing') AND assigned_agent_id IS NOT NULL ORDER BY updated_at DESC LIMIT 50"
      );

      if (tasks.length === 0) return;

      const client = getOpenClawClient();
      if (!client.isConnected()) {
        try {
          await client.connect();
        } catch {
          return;
        }
      }

      for (const task of tasks) {
        const agent = queryOne<Agent>(
          'SELECT * FROM agents WHERE id = ?',
          [task.assigned_agent_id]
        );
        if (!agent) continue;

        // METHOD 1: Check for completion activities (newer approach)
        // Look for recently created 'completed' activities for in_progress tasks
        if (task.status === 'in_progress') {
          const completionActivity = queryOne<{ id: string; message: string; created_at: string }>(
            `SELECT id, message, created_at FROM task_activities 
             WHERE task_id = ? AND activity_type = 'completed' 
             AND created_at > datetime('now', '-5 minutes')
             ORDER BY created_at DESC LIMIT 1`,
            [task.id]
          );
          
          if (completionActivity) {
            const summary = completionActivity.message || 'Task completed';
            const now = new Date().toISOString();
            
            console.log('[Watcher] Found completion activity for task', task.id, 'summary:', summary.substring(0, 80));
            
            try {
              transaction(() => {
                // Move task to testing
                const newStatus = 'testing';
                const taskResult = run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', [newStatus, now, task.id]);
                console.log('[Watcher] Task status updated to', newStatus, 'changes:', taskResult.changes);
                
                // Agent back to standby
                const agentResult = run('UPDATE agents SET status = ?, updated_at = ? WHERE id = ?', ['standby', now, agent.id]);
                console.log('[Watcher] Agent status updated, changes:', agentResult.changes);
                
                // Event for feed (skip activity creation since it already exists)
                run(
                  `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)`,
                  [uuidv4(), 'task_completed', agent.id, task.id, `${agent.name} completed: ${summary}`, now]
                );
              });
              
              // Broadcast update after successful transaction
              const updated = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [task.id]);
              if (updated) {
                broadcast({ type: 'task_updated', payload: updated });
                console.log('[Watcher] Broadcast task update for', task.id, 'new status:', updated.status);
              }
              
              // Skip to next task - we've handled this one
              continue;
            } catch (txError) {
              console.error('[Watcher] Transaction failed for task', task.id, ':', txError instanceof Error ? txError.message : txError);
            }
          }
        }

        // METHOD 2: Legacy - Check chat history for TASK_COMPLETE message
        const sessionKey = (agent as any).session_key as string | undefined;
        if (!sessionKey) continue;

        // Pull a small slice of history and look for TASK_COMPLETE.
        // We rely on seq monotonicity where available.
        let history: any;
        try {
          history = await client.call('chat.history', { sessionKey, limit: 50 });
        } catch {
          continue;
        }

        const items: any[] = Array.isArray(history) ? history : (history?.messages || history?.items || []);
        if (!Array.isArray(items) || items.length === 0) continue;

        const lastSeq = state.lastSeenSeq[sessionKey] ?? -1;
        for (const ev of items) {
          const seq = typeof ev?.seq === 'number' ? ev.seq : undefined;
          if (seq !== undefined && seq <= lastSeq) continue;

          const text = extractText(ev);
          if (!text) {
            if (seq !== undefined) state.lastSeenSeq[sessionKey] = Math.max(state.lastSeenSeq[sessionKey] ?? -1, seq);
            continue;
          }

          const m = text.match(/TASK_COMPLETE:\s*(.+)/i);
          if (m) {
            const summary = m[1].trim();
            const now = new Date().toISOString();

            console.log('[Watcher] TASK_COMPLETE detected for task', task.id, 'summary:', summary.substring(0, 80));

            try {
              // Use atomic transaction for all updates
              transaction(() => {
                // Log completion evidence
                run(
                  `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)`,
                  [uuidv4(), task.id, agent.id, 'completed', summary || 'Task completed', now]
                );

                // Auto-register deliverables by scanning the task output directory
                try {
                  const { getProjectsPath } = require('@/lib/config');
                  const fs = require('fs');
                  const path = require('path');

                  const projectsPath = getProjectsPath();
                  const taskProjectDir = (task as any).output_dir
                    ? String((task as any).output_dir)
                    : (() => {
                        const projectDir = task.title
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/^-|-$/g, '');
                        return `${projectsPath}/${projectDir}`;
                      })();

                  if (fs.existsSync(taskProjectDir) && fs.statSync(taskProjectDir).isDirectory()) {
                    const entries = fs.readdirSync(taskProjectDir, { withFileTypes: true });
                    let deliverableCount = 0;
                    for (const ent of entries) {
                      if (!ent.isFile()) continue;
                      const fullPath = path.join(taskProjectDir, ent.name);

                      // avoid duplicates
                      const existingDel = queryOne<{ c: number }>(
                        'SELECT COUNT(1) as c FROM task_deliverables WHERE task_id = ? AND path = ?',
                        [task.id, fullPath]
                      );
                      if (existingDel && existingDel.c > 0) continue;

                      run(
                        `INSERT INTO task_deliverables (id, task_id, deliverable_type, title, path, description, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [uuidv4(), task.id, 'file', ent.name, fullPath, 'Auto-detected deliverable', now]
                      );
                      deliverableCount++;
                    }
                    console.log('[Watcher] Registered', deliverableCount, 'deliverables for task', task.id);
                  } else {
                    console.warn('[Watcher] Output directory not found:', taskProjectDir);
                  }
                } catch (e) {
                  console.warn('[Watcher] Deliverable scan failed:', e instanceof Error ? e.message : e);
                }

                // Move task to testing for verification (agent-driven workflow)
                const newStatus = 'testing';
                const taskResult = run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', [newStatus, now, task.id]);
                console.log('[Watcher] Task status updated to', newStatus, 'changes:', taskResult.changes);

                // Agent back to standby
                const agentResult = run('UPDATE agents SET status = ?, updated_at = ? WHERE id = ?', ['standby', now, agent.id]);
                console.log('[Watcher] Agent status updated, changes:', agentResult.changes);

                // Event for feed
                run(
                  `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)`,
                  [uuidv4(), 'task_completed', agent.id, task.id, `${agent.name} completed: ${summary}`, now]
                );
              });

              // Broadcast update after successful transaction
              const updated = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [task.id]);
              if (updated) {
                broadcast({ type: 'task_updated', payload: updated });
                console.log('[Watcher] Broadcast task update for', task.id, 'new status:', updated.status);
              }
            } catch (txError) {
              console.error('[Watcher] Transaction failed for task', task.id, ':', txError instanceof Error ? txError.message : txError);
            }
          }

          if (seq !== undefined) state.lastSeenSeq[sessionKey] = Math.max(state.lastSeenSeq[sessionKey] ?? -1, seq);
        }
      }
    } catch (err) {
      console.error('[Watcher] Unexpected error:', err instanceof Error ? err.message : err);
    }
  }, intervalMs);
}

function extractText(ev: any): string | null {
  // Try a few common shapes.
  if (typeof ev === 'string') return ev;
  if (typeof ev?.content === 'string') return ev.content;
  if (typeof ev?.message === 'string') return ev.message;
  if (typeof ev?.text === 'string') return ev.text;

  const msg = ev?.message;
  if (typeof msg === 'object' && msg) {
    if (typeof msg.content === 'string') return msg.content;
    // OpenAI-ish: message.content = [{type:'text', text:'...'}]
    if (Array.isArray(msg.content)) {
      const parts = msg.content
        .map((p: any) => (typeof p?.text === 'string' ? p.text : (typeof p === 'string' ? p : '')))
        .filter(Boolean);
      if (parts.length) return parts.join('');
    }
  }

  return null;
}
