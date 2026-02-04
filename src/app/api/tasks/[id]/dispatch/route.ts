import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run, transaction } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';
import { getProjectsPath, getMissionControlUrl } from '@/lib/config';
import type { Task, Agent, OpenClawSession } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/tasks/[id]/dispatch
 * 
 * Dispatches a task to its assigned agent's OpenClaw session.
 * Creates session if needed, sends task details to agent.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  let updateErrors: string[] = [];
  
  try {
    const { id } = await params;
    const now = new Date().toISOString();

    // Get task with agent info
    const task = queryOne<Task & { assigned_agent_name?: string; agent_model?: string }>(
      `SELECT t.*, a.name as assigned_agent_name, a.is_master, a.model as agent_model
       FROM tasks t
       LEFT JOIN agents a ON t.assigned_agent_id = a.id
       WHERE t.id = ?`,
      [id]
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (!task.assigned_agent_id) {
      return NextResponse.json(
        { error: 'Task has no assigned agent' },
        { status: 400 }
      );
    }

    // Get agent details
    const agent = queryOne<Agent>(
      'SELECT * FROM agents WHERE id = ?',
      [task.assigned_agent_id]
    );

    if (!agent) {
      return NextResponse.json({ error: 'Assigned agent not found' }, { status: 404 });
    }

    // Connect to OpenClaw Gateway
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch (err) {
        console.error('Failed to connect to OpenClaw Gateway:', err);
        return NextResponse.json(
          { error: 'Failed to connect to OpenClaw Gateway' },
          { status: 503 }
        );
      }
    }

    // Get or create OpenClaw session for this agent
    let session = queryOne<OpenClawSession>(
      'SELECT * FROM openclaw_sessions WHERE agent_id = ? AND status = ?',
      [agent.id, 'active']
    );

    if (!session) {
      // Create session record
      const sessionId = uuidv4();
      const openclawSessionId = `mission-control-${agent.name.toLowerCase().replace(/\s+/g, '-')}`;
      
      try {
        run(
          `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, channel, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [sessionId, agent.id, openclawSessionId, 'mission-control', 'active', now, now]
        );

        session = queryOne<OpenClawSession>(
          'SELECT * FROM openclaw_sessions WHERE id = ?',
          [sessionId]
        );

        run(
          `INSERT INTO events (id, type, agent_id, message, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), 'agent_status_changed', agent.id, `${agent.name} session created`, now]
        );
      } catch (e) {
        console.error('[Dispatch] Failed to create session:', e);
      }
    }

    // Build task message for agent
    const priorityEmoji = {
      low: '🔵',
      normal: '⚪',
      high: '🟡',
      urgent: '🔴'
    }[task.priority] || '⚪';

    // Get project path for deliverables
    const projectsPath = getProjectsPath();
    const projectDir = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const taskProjectDir = task.output_dir || `${projectsPath}/${projectDir}`;
    const missionControlUrl = getMissionControlUrl();

    // Persist the output dir on the task
    try {
      run('UPDATE tasks SET output_dir = ?, updated_at = ? WHERE id = ?', [taskProjectDir, now, task.id]);
    } catch (e) {
      console.warn('[Dispatch] Failed to persist output_dir:', e instanceof Error ? e.message : e);
    }

    const taskMessage = `${priorityEmoji} **NEW TASK ASSIGNED**

**Title:** ${task.title}
${task.description ? `**Description:** ${task.description}\n` : ''}
**Priority:** ${task.priority.toUpperCase()}
${task.due_date ? `**Due:** ${task.due_date}\n` : ''}
**Task ID:** ${task.id}

**OUTPUT DIRECTORY:** ${taskProjectDir}
Create this directory and save all deliverables there.

**IMPORTANT:** After completing work, you MUST call these APIs:
1. Log activity: POST ${missionControlUrl}/api/tasks/${task.id}/activities
   Body: {"activity_type": "completed", "message": "Description of what was done"}
2. Register deliverable: POST ${missionControlUrl}/api/tasks/${task.id}/deliverables
   Body: {"deliverable_type": "file", "title": "File name", "path": "${taskProjectDir}/filename.html"}
3. Update status: PATCH ${missionControlUrl}/api/tasks/${task.id}
   Body: {"status": "review"}

When complete, reply with:
\`TASK_COMPLETE: [brief summary of what you did]\`

If you need help or clarification, ask me (Charlie).`;

    // Send message to agent's session
    try {
      const targetSessionKey = (agent as any).session_key || 'agent:main:main';
      console.log('[Dispatch] Sending task', task.id, 'to sessionKey=' + targetSessionKey);

      // Ensure the target session is active
      try {
        const live = await client.listSessions();
        const isActive = Array.isArray(live) ? (live as any[]).some((s) => s?.key === targetSessionKey) : false;
        if (!isActive) {
          console.log('[Dispatch] Waking session:', targetSessionKey);
          await client.call('wake', { sessionKey: targetSessionKey });
        }
      } catch (e) {
        console.warn('[Dispatch] Wake warning:', e instanceof Error ? e.message : e);
      }

      // Apply per-agent model override
      try {
        const { resolveAgentModel } = await import('@/lib/model-routing');
        const effectiveModel = resolveAgentModel({
          sessionKey: targetSessionKey,
          agentModel: (agent as any).model,
        });

        if (effectiveModel) {
          console.log('[Dispatch] Model override:', targetSessionKey, '->', effectiveModel);
          await client.call('sessions.patch', { sessionKey: targetSessionKey, model: effectiveModel });
        }
      } catch (e) {
        console.warn('[Dispatch] Model override failed:', e instanceof Error ? e.message : e);
      }

      await client.sendMessage(targetSessionKey, taskMessage);
      console.log('[Dispatch] Message sent successfully');

      // CRITICAL: Update task status to in_progress using transaction
      console.log('[Dispatch] Starting transaction block...');
      try {
        const freshNow = new Date().toISOString();
        console.log('[Dispatch] Timestamp:', freshNow, 'Task ID:', id, 'Agent ID:', agent.id);

        const result = transaction(() => {
          console.log('[Dispatch] Inside transaction, updating task...');
          const taskUpdate = run(
            'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
            ['in_progress', freshNow, id]
          );
          console.log('[Dispatch] Task UPDATE result:', { changes: taskUpdate.changes, lastInsertRowid: taskUpdate.lastInsertRowid });

          console.log('[Dispatch] Inside transaction, updating agent...');
          const agentUpdate = run(
            'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
            ['working', freshNow, agent.id]
          );
          console.log('[Dispatch] Agent UPDATE result:', { changes: agentUpdate.changes });

          console.log('[Dispatch] Inside transaction, inserting event...');
          const eventInsert = run(
            `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), 'task_dispatched', agent.id, task.id, `Task "${task.title}" dispatched to ${agent.name}`, freshNow]
          );
          console.log('[Dispatch] Event INSERT result:', { changes: eventInsert.changes });

          return { success: true, taskChanges: taskUpdate.changes, agentChanges: agentUpdate.changes };
        });
        console.log('[Dispatch] Transaction committed successfully:', result);
      } catch (txError) {
        const errorMsg = `[Dispatch] Transaction FAILED: ${txError instanceof Error ? txError.message : String(txError)}`;
        updateErrors.push(errorMsg);
        console.error(errorMsg);
        console.error('[Dispatch] Stack trace:', txError instanceof Error ? txError.stack : 'No stack');
      }

      // Broadcast the update (even if inside transaction, we need fresh data)
      const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
      console.log('[Dispatch] Task status after update:', updatedTask?.status);
      
      if (updatedTask) {
        broadcast({
          type: 'task_updated',
          payload: updatedTask,
        });
      }

      return NextResponse.json({
        success: true,
        task_id: task.id,
        agent_id: agent.id,
        new_status: updatedTask?.status || 'unknown',
        errors: updateErrors.length > 0 ? updateErrors : undefined,
        message: 'Task dispatched to agent'
      });
    } catch (err) {
      console.error('Failed to send message to agent:', err);
      return NextResponse.json(
        { error: `Failed to send task to agent: ${err instanceof Error ? err.message : 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Failed to dispatch task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to dispatch task', details: updateErrors },
      { status: 500 }
    );
  }
}
