import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
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
  try {
    const { id } = await params;

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

    const now = new Date().toISOString();

    if (!session) {
      // Create session record
      const sessionId = uuidv4();
      const openclawSessionId = `mission-control-${agent.name.toLowerCase().replace(/\s+/g, '-')}`;
      
      run(
        `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, channel, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, agent.id, openclawSessionId, 'mission-control', 'active', now, now]
      );

      session = queryOne<OpenClawSession>(
        'SELECT * FROM openclaw_sessions WHERE id = ?',
        [sessionId]
      );

      // Log session creation
      run(
        `INSERT INTO events (id, type, agent_id, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), 'agent_status_changed', agent.id, `${agent.name} session created`, now]
      );
    }

    if (!session) {
      return NextResponse.json(
        { error: 'Failed to create agent session' },
        { status: 500 }
      );
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
    const taskProjectDir = `${projectsPath}/${projectDir}`;
    const missionControlUrl = getMissionControlUrl();

    // Persist the output dir on the task so future scans don't depend on title slug
    try {
      run('UPDATE tasks SET output_dir = ?, updated_at = ? WHERE id = ?', [taskProjectDir, now, task.id]);
    } catch (e) {
      console.warn('[Dispatch] Failed to persist output_dir on task:', e instanceof Error ? e.message : e);
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

    // Send message to agent's session using sessions_send
    try {
      // Dispatch to the OpenClaw session key.
      // NOTE: The seeded DB creates a pseudo label like "mission-control-charlie",
      // but OpenClaw routes by real session keys (e.g. "agent:main:main").
      // For now, route all tasks to the main orchestrator session.
      // TODO: add `session_key` to agents and use it here for per-agent dispatch.
      const targetSessionKey = (agent as any).session_key || 'agent:main:main';
      console.log('[Dispatch] Sending task', task.id, 'to OpenClaw sessionKey=' + targetSessionKey);

      // Ensure the target session is active (auto-wake if missing)
      try {
        const live = await client.listSessions();
        const isActive = Array.isArray(live) ? (live as any[]).some((s) => s?.key === targetSessionKey) : false;
        if (!isActive) {
          console.log('[Dispatch] Session not active, waking:', targetSessionKey);
          // OpenClaw gateway supports `wake`
          await client.call('wake', { sessionKey: targetSessionKey });
        }
      } catch (e) {
        console.warn('[Dispatch] Failed to verify/wake session; will try sending anyway:', e instanceof Error ? e.message : e);
      }

      // Apply per-agent model override dynamically (Agent setting > Session key fallback > System default)
      try {
        const { resolveAgentModel } = await import('@/lib/model-routing');
        const effectiveModel = resolveAgentModel({
          sessionKey: targetSessionKey,
          agentModel: (agent as any).model,
        });

        if (effectiveModel) {
          if ((agent as any).model) {
            console.log('[Dispatch] Applying agent-configured model for', agent.name, '->', effectiveModel);
          } else {
            console.log('[Dispatch] Applying fallback model for', targetSessionKey, '->', effectiveModel);
          }
          await client.call('sessions.patch', { sessionKey: targetSessionKey, model: effectiveModel });
        } else {
          console.log('[Dispatch] No model override; using system default for', targetSessionKey);
        }
      } catch (e) {
        console.warn('[Dispatch] Model override failed (continuing):', e instanceof Error ? e.message : e);
      }

      await client.sendMessage(targetSessionKey, taskMessage);
      console.log('[Dispatch] Sent OK');

      // Update task status to in_progress
      run(
        'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
        ['in_progress', now, id]
      );

      // Broadcast task update
      const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
      if (updatedTask) {
        broadcast({
          type: 'task_updated',
          payload: updatedTask,
        });
      }

      // Update agent status to working
      run(
        'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
        ['working', now, agent.id]
      );

      // Log dispatch event
      run(
        `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          'task_dispatched',
          agent.id,
          task.id,
          `Task "${task.title}" dispatched to ${agent.name}`,
          now
        ]
      );

      return NextResponse.json({
        success: true,
        task_id: task.id,
        agent_id: agent.id,
        session_id: session.openclaw_session_id,
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
      { error: error instanceof Error ? error.message : 'Failed to dispatch task' },
      { status: 500 }
    );
  }
}
