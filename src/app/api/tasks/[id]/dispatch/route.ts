import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import { queryOne, run, transaction } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';
import { getProjectsPath, getMissionControlUrl } from '@/lib/config';
import type { Task, Agent, OpenClawSession } from '@/lib/types';

// Expand tilde (~) to home directory
function expandPath(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return p.replace('~', os.homedir());
  }
  return p;
}

// Structured logger for dispatch operations
function log(level: 'info' | 'warn' | 'error', context: string, message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    context: `[Dispatch:${context}]`,
    message,
    ...meta
  };
  
  if (level === 'error') {
    console.error(JSON.stringify(logEntry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface DispatchResult {
  success: boolean;
  task_id?: string;
  agent_id?: string;
  new_status?: string;
  message: string;
  errors?: string[];
  warnings?: string[];
  stage?: string;
}

/**
 * POST /api/tasks/[id]/dispatch
 * 
 * Dispatches a task to its assigned agent's OpenClaw session.
 * Creates session if needed, sends task details to agent.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse<DispatchResult>> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let stage = 'init';
  
  try {
    const { id } = await params;
    const now = new Date().toISOString();
    
    log('info', 'Init', 'Starting task dispatch', { taskId: id, timestamp: now });

    stage = 'fetch_task';
    
    // Get task with agent info
    const task = queryOne<Task & { assigned_agent_name?: string; agent_model?: string }>(
      `SELECT t.*, a.name as assigned_agent_name, a.is_master, a.model as agent_model
       FROM tasks t
       LEFT JOIN agents a ON t.assigned_agent_id = a.id
       WHERE t.id = ?`,
      [id]
    );

    if (!task) {
      log('error', 'FetchTask', 'Task not found', { taskId: id });
      return NextResponse.json({ 
        success: false, 
        message: 'Task not found',
        stage
      }, { status: 404 });
    }

    log('info', 'FetchTask', 'Task retrieved successfully', { 
      taskId: id, 
      taskTitle: task.title,
      currentStatus: task.status,
      assignedAgentId: task.assigned_agent_id 
    });

    if (!task.assigned_agent_id) {
      log('error', 'Validation', 'Task has no assigned agent', { taskId: id });
      return NextResponse.json(
        { success: false, message: 'Task has no assigned agent', stage },
        { status: 400 }
      );
    }

    // Get agent details
    stage = 'fetch_agent';
    const agent = queryOne<Agent>(
      'SELECT * FROM agents WHERE id = ?',
      [task.assigned_agent_id]
    );

    if (!agent) {
      log('error', 'FetchAgent', 'Assigned agent not found in database', { 
        taskId: id, 
        agentId: task.assigned_agent_id 
      });
      return NextResponse.json({ 
        success: false, 
        message: 'Assigned agent not found',
        stage
      }, { status: 404 });
    }
    
    log('info', 'FetchAgent', 'Agent retrieved successfully', { 
      agentId: agent.id, 
      agentName: agent.name,
      agentStatus: agent.status 
    });

    stage = 'connect_openclaw';
    
    // Connect to OpenClaw Gateway
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try {
        log('info', 'Connect', 'Connecting to OpenClaw Gateway...');
        await client.connect();
        log('info', 'Connect', 'Successfully connected to OpenClaw Gateway');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown connection error';
        log('error', 'Connect', 'Failed to connect to OpenClaw Gateway', { error: errorMsg });
        return NextResponse.json(
          { success: false, message: `Failed to connect to OpenClaw Gateway: ${errorMsg}`, stage },
          { status: 503 }
        );
      }
    } else {
      log('info', 'Connect', 'Using existing OpenClaw connection');
    }

    stage = 'manage_session';
    
    // Get or create OpenClaw session for this agent
    let session = queryOne<OpenClawSession>(
      'SELECT * FROM openclaw_sessions WHERE agent_id = ? AND status = ?',
      [agent.id, 'active']
    );

    if (!session) {
      log('info', 'Session', 'No active session found, creating new session', { agentId: agent.id });
      
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
        
        log('info', 'Session', 'New session created successfully', { 
          sessionId, 
          openclawSessionId,
          agentId: agent.id 
        });

        run(
          `INSERT INTO events (id, type, agent_id, message, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), 'agent_status_changed', agent.id, `${agent.name} session created`, now]
        );
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        log('error', 'Session', 'Failed to create session record', { error: errorMsg, agentId: agent.id });
        warnings.push(`Session creation warning: ${errorMsg}`);
      }
    } else {
      log('info', 'Session', 'Using existing active session', { 
        sessionId: session.id,
        openclawSessionId: session.openclaw_session_id 
      });
    }

    stage = 'prepare_message';
    
    // Build task message for agent
    const priorityEmoji = {
      low: '🔵',
      normal: '⚪',
      high: '🟡',
      urgent: '🔴'
    }[task.priority] || '⚪';

    // Get project path for deliverables (expand tilde to absolute path)
    const projectsPath = expandPath(getProjectsPath());
    const projectDir = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const taskProjectDir = task.output_dir 
      ? expandPath(task.output_dir)
      : `${projectsPath}/${projectDir}`;
    const missionControlUrl = getMissionControlUrl();

    // Persist the output dir on the task
    try {
      const persistResult = run('UPDATE tasks SET output_dir = ?, updated_at = ? WHERE id = ?', [taskProjectDir, now, task.id]);
      log('info', 'Prepare', 'Persisted output directory to task', { 
        taskId: id, 
        outputDir: taskProjectDir,
        rowsAffected: persistResult.changes 
      });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      log('warn', 'Prepare', 'Failed to persist output_dir (non-critical)', { 
        taskId: id, 
        error: errorMsg 
      });
      warnings.push(`Output dir persistence warning: ${errorMsg}`);
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

    stage = 'send_message';
    
    // Send message to agent's session
    try {
      // Determine session key: use agent's configured key, or fall back to gateway default
      // The gateway's main agent session is always "agent:main:main"
      const agentSessionKey = (agent as any).session_key as string | undefined;
      const targetSessionKey = agentSessionKey || 'agent:main:main';
      log('info', 'SendMessage', 'Preparing to send task to agent', { 
        taskId: task.id, 
        targetSessionKey,
        agentName: agent.name 
      });

      // Check if the target session is active on the gateway
      try {
        const liveResult = await client.listSessions();
        // Gateway returns { sessions: [...] } or a flat array
        const liveList = Array.isArray(liveResult)
          ? liveResult
          : (Array.isArray((liveResult as any)?.sessions) ? (liveResult as any).sessions : []);
        const isActive = liveList.some((s: any) => s?.key === targetSessionKey);
        log('info', 'SendMessage', 'Session status check', {
          targetSessionKey,
          isActive,
          totalSessions: liveList.length
        });

        if (!isActive) {
          log('warn', 'SendMessage', 'Target session is not active on gateway', { targetSessionKey });
          warnings.push(`Session "${targetSessionKey}" is not active on the gateway — message may not be delivered`);
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        log('warn', 'SendMessage', 'Session check warning (non-critical)', {
          targetSessionKey,
          error: errorMsg
        });
      }

      // Apply per-agent model override
      try {
        const { resolveAgentModel } = await import('@/lib/model-routing');
        const effectiveModel = resolveAgentModel({
          sessionKey: targetSessionKey,
          agentModel: (agent as any).model,
        });

        if (effectiveModel) {
          log('info', 'SendMessage', 'Applying model override', { 
            targetSessionKey, 
            model: effectiveModel 
          });
          await client.call('sessions.patch', { key: targetSessionKey, model: effectiveModel });
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        log('warn', 'SendMessage', 'Model override failed (non-critical)', { error: errorMsg });
        warnings.push(`Model override warning: ${errorMsg}`);
      }

      await client.sendMessage(targetSessionKey, taskMessage);
      log('info', 'SendMessage', 'Task message sent successfully', { 
        taskId: task.id, 
        targetSessionKey 
      });

      stage = 'update_database';
      
      // CRITICAL: Update task status to in_progress using transaction
      log('info', 'Database', 'Starting transaction to update task and agent status', { 
        taskId: id, 
        agentId: agent.id 
      });
      
      let txResult: { success: boolean; taskChanges: number; agentChanges: number } | null = null;
      
      try {
        const freshNow = new Date().toISOString();
        
        txResult = transaction(() => {
          const taskUpdate = run(
            'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
            ['in_progress', freshNow, id]
          );

          const agentUpdate = run(
            'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
            ['working', freshNow, agent.id]
          );

          // Log to events table (global feed)
          const eventInsert = run(
            `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), 'task_dispatched', agent.id, task.id, `Task "${task.title}" dispatched to ${agent.name}`, freshNow]
          );

          // Log to task_activities table (task activity tab)
          const activityInsert = run(
            `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), task.id, agent.id, 'spawned', `Task dispatched to ${agent.name} for execution`, freshNow]
          );

          // Link openclaw_session to this task if session exists
          if (session?.id) {
            run('UPDATE openclaw_sessions SET task_id = ? WHERE id = ?', [task.id, session.id]);
          }

          return { 
            success: true, 
            taskChanges: taskUpdate.changes, 
            agentChanges: agentUpdate.changes 
          };
        });
        
        log('info', 'Database', 'Transaction committed successfully', { 
          taskId: id,
          taskRowsUpdated: txResult.taskChanges,
          agentRowsUpdated: txResult.agentChanges 
        });
      } catch (txError) {
        const errorMsg = txError instanceof Error ? txError.message : String(txError);
        const stack = txError instanceof Error ? txError.stack : undefined;
        
        log('error', 'Database', 'Transaction FAILED', { 
          taskId: id,
          error: errorMsg,
          stack 
        });
        
        errors.push(`Database transaction failed: ${errorMsg}`);
        
        // Still return 200 since message was sent, but include error details
        return NextResponse.json({
          success: true,
          task_id: task.id,
          agent_id: agent.id,
          new_status: task.status,  // Old status since transaction failed
          message: 'Task dispatched to agent, but database update failed',
          errors,
          warnings,
          stage
        }, { status: 207 });  // Multi-status
      }

      // Broadcast the update
      const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
      
      if (updatedTask) {
        log('info', 'Database', 'Task status after update', { 
          taskId: id,
          newStatus: updatedTask.status 
        });
        
        broadcast({
          type: 'task_updated',
          payload: updatedTask,
        });
      } else {
        log('warn', 'Database', 'Could not fetch updated task after transaction', { taskId: id });
        warnings.push('Could not verify task update after transaction');
      }

      return NextResponse.json({
        success: true,
        task_id: task.id,
        agent_id: agent.id,
        new_status: updatedTask?.status || 'in_progress',
        message: 'Task dispatched to agent successfully',
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        stage: 'complete'
      });
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      const stack = err instanceof Error ? err.stack : undefined;
      
      log('error', 'SendMessage', 'Failed to send message to agent', {
        taskId: id,
        error: errorMsg,
        stack
      });
      
      return NextResponse.json(
        { 
          success: false, 
          message: `Failed to send task to agent: ${errorMsg}`,
          errors: [...errors, errorMsg],
          warnings: warnings.length > 0 ? warnings : undefined,
          stage 
        },
        { status: 500 }
      );
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to dispatch task';
    const stack = error instanceof Error ? error.stack : undefined;
    
    log('error', 'Dispatch', 'Unhandled exception in dispatch', {
      error: errorMsg,
      stack,
      stage
    });
    
    return NextResponse.json(
      { 
        success: false, 
        message: errorMsg,
        errors: [...errors, errorMsg],
        warnings: warnings.length > 0 ? warnings : undefined,
        stage 
      },
      { status: 500 }
    );
  }
}
