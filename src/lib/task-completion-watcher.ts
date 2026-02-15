import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run, transaction } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';
import { sendTaskNotification } from '@/lib/task-notifier';
import type { Task, Agent } from '@/lib/types';

type WatchState = {
  lastSeenSeq: Record<string, number>; // sessionKey -> last seq processed
};

const state: WatchState = {
  lastSeenSeq: {},
};

const TASK_TIMEOUT_MINUTES = Number(process.env.MC_TASK_TIMEOUT_MINUTES || 60);

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

                // Send completion notification (phone/email)
                sendTaskNotification(updated, 'completed', completionActivity.message).catch(() => {});
              }

              // Check if completing this task unblocks any dependents
              checkAndBroadcastUnblocked(task.id);

              // Skip to next task - we've handled this one
              continue;
            } catch (txError) {
              console.error('[Watcher] Transaction failed for task', task.id, ':', txError instanceof Error ? txError.message : txError);
            }
          }
        }

        // FAILURE DETECTION: Check for stale/failed tasks
        if (task.status === 'in_progress' || task.status === 'assigned') {
          const failureReason = detectFailure(task, agent);
          if (failureReason) {
            handleTaskFailure(task, agent, failureReason);
            continue;
          }
        }

        // METHOD 2: Legacy - Check chat history for TASK_COMPLETE or TASK_FAILED message
        // Use agent's configured session_key, or fall back to the gateway's main session
        const sessionKey = ((agent as any).session_key as string | undefined) || 'agent:main:main';

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

          // Check for TASK_FAILED pattern
          const failMatch = text.match(/TASK_FAILED:\s*(.+)/i);
          if (failMatch) {
            const reason = failMatch[1].trim();
            console.log('[Watcher] TASK_FAILED detected for task', task.id, 'reason:', reason.substring(0, 80));
            handleTaskFailure(task, agent, `Agent reported failure: ${reason}`);
            if (seq !== undefined) state.lastSeenSeq[sessionKey] = Math.max(state.lastSeenSeq[sessionKey] ?? -1, seq);
            break; // Stop processing this task's history
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

                // Send completion notification (phone/email)
                sendTaskNotification(updated, 'completed', summary).catch(() => {});
              }

              // Check if completing this task unblocks any dependents
              checkAndBroadcastUnblocked(task.id);
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

/**
 * Detect if a task has failed based on session state and timeouts.
 * Returns a failure reason string, or null if no failure detected.
 */
function detectFailure(task: Task, agent: Agent): string | null {
  // Check 1: Agent is offline
  if (agent.status === 'offline') {
    return `Agent "${agent.name}" is offline`;
  }

  // Check 2: Agent's session is failed/inactive
  const session = queryOne<{ status: string }>(
    `SELECT status FROM openclaw_sessions
     WHERE agent_id = ? AND task_id = ?
     ORDER BY created_at DESC LIMIT 1`,
    [agent.id, task.id]
  );
  if (session && (session.status === 'failed' || session.status === 'inactive')) {
    return `Agent session is ${session.status}`;
  }

  // Check 3: Task has been in_progress for too long (timeout)
  if (task.status === 'in_progress') {
    const updatedAt = new Date(task.updated_at).getTime();
    const now = Date.now();
    const elapsedMinutes = (now - updatedAt) / (1000 * 60);

    if (elapsedMinutes > TASK_TIMEOUT_MINUTES) {
      return `Task timed out after ${Math.round(elapsedMinutes)} minutes (limit: ${TASK_TIMEOUT_MINUTES}m)`;
    }
  }

  return null;
}

/**
 * Handle a detected task failure: auto-retry if retries available, otherwise mark as failed.
 */
function handleTaskFailure(task: Task, agent: Agent, reason: string) {
  const now = new Date().toISOString();
  const retryCount = task.retry_count ?? 0;
  const maxRetries = task.max_retries ?? 2;

  if (retryCount < maxRetries) {
    // Auto-retry: move back to assigned
    console.log('[Watcher] Auto-retrying task', task.id, `(attempt ${retryCount + 1}/${maxRetries})`, 'reason:', reason);

    try {
      transaction(() => {
        run(
          'UPDATE tasks SET status = ?, retry_count = ?, updated_at = ? WHERE id = ?',
          ['assigned', retryCount + 1, now, task.id]
        );
        run(
          'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
          ['standby', now, agent.id]
        );
        run(
          `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, metadata, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), task.id, agent.id, 'retried', `Auto-retry (${retryCount + 1}/${maxRetries}): ${reason}`, JSON.stringify({ retry_count: retryCount + 1, reason }), now]
        );
        run(
          `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuidv4(), 'task_retried', agent.id, task.id, `Task "${task.title}" auto-retrying (${retryCount + 1}/${maxRetries}): ${reason}`, now]
        );
      });

      const updated = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [task.id]);
      if (updated) {
        broadcast({ type: 'task_updated', payload: updated });
      }
    } catch (e) {
      console.error('[Watcher] Auto-retry transaction failed for task', task.id, ':', e instanceof Error ? e.message : e);
    }
  } else {
    // Retries exhausted: mark as failed
    console.log('[Watcher] Marking task', task.id, 'as failed (retries exhausted). Reason:', reason);

    try {
      transaction(() => {
        run(
          'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
          ['failed', now, task.id]
        );
        run(
          'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
          ['standby', now, agent.id]
        );
        run(
          `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, metadata, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), task.id, agent.id, 'failed', reason, JSON.stringify({ retry_count: retryCount, max_retries: maxRetries }), now]
        );
        run(
          `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuidv4(), 'task_failed', agent.id, task.id, `Task "${task.title}" failed: ${reason}`, now]
        );
      });

      const updated = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [task.id]);
      if (updated) {
        broadcast({ type: 'task_failed', payload: updated });

        // Send failure notification (phone/email)
        sendTaskNotification(updated, 'failed', reason).catch(() => {});
      }
    } catch (e) {
      console.error('[Watcher] Failure transaction failed for task', task.id, ':', e instanceof Error ? e.message : e);
    }
  }
}

/**
 * After a task moves to testing/done, check if any dependent tasks
 * are now fully unblocked and broadcast dependency_changed events.
 */
function checkAndBroadcastUnblocked(completedTaskId: string) {
  try {
    const dependents = queryAll<{ task_id: string }>(
      'SELECT task_id FROM task_dependencies WHERE dependency_id = ?',
      [completedTaskId]
    );

    for (const { task_id: depTaskId } of dependents) {
      const remaining = queryOne<{ c: number }>(
        `SELECT COUNT(*) as c FROM task_dependencies td
         JOIN tasks t ON td.dependency_id = t.id
         WHERE td.task_id = ? AND t.status != 'done'`,
        [depTaskId]
      );

      if (remaining && remaining.c === 0) {
        console.log('[Watcher] Task', depTaskId, 'is now unblocked');
        broadcast({ type: 'dependency_changed', payload: { taskId: depTaskId, unblocked: true } });
      }
    }
  } catch (e) {
    console.warn('[Watcher] checkAndBroadcastUnblocked failed:', e instanceof Error ? e.message : e);
  }
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
