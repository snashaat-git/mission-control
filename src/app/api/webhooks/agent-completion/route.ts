import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import type { Task, Agent, OpenClawSession } from '@/lib/types';

function log(level: 'info' | 'warn' | 'error', context: string, message: string, meta?: Record<string, unknown>) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    context: `[Webhook:${context}]`,
    message,
    ...meta
  };
  
  if (level === 'error') console.error(JSON.stringify(logEntry));
  else if (level === 'warn') console.warn(JSON.stringify(logEntry));
  else console.log(JSON.stringify(logEntry));
}

interface CompletionResult {
  success: boolean;
  task_id?: string;
  agent_id?: string;
  new_status?: string;
  message: string;
  errors?: string[];
  warnings?: string[];
}

/**
 * POST /api/webhooks/agent-completion
 * 
 * Receives completion notifications from agents.
 * 
 * Expected payloads:
 * 
 * 1. Direct task completion (preferred):
 * {
 *   "task_id": "uuid",
 *   "summary": "Completed the task successfully",
 *   "agent_id": "uuid"  // Optional if known from session
 * }
 * 
 * 2. Session-based completion (legacy):
 * {
 *   "session_id": "mission-control-engineering",
 *   "message": "TASK_COMPLETE: Built the authentication system"
 * }
 * 
 * 3. Activity-based completion (creates activity then moves to testing):
 * {
 *   "task_id": "uuid",
 *   "activity": {
 *     "activity_type": "completed",
 *     "message": "Description of work done"
 *   },
 *   "deliverables": [  // Optional
 *     { "type": "file", "title": "index.html", "path": "/full/path" }
 *   ]
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse<CompletionResult>> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    const body = await request.json();
    const now = new Date().toISOString();
    
    log('info', 'AgentCompletion', 'Received completion webhook', { body });

    // === Method 1: Direct task_id with activity creation ===
    if (body.task_id && body.activity) {
      return handleActivityCompletion(body, now, errors, warnings);
    }
    
    // === Method 2: Direct task_id (simple) ===
    if (body.task_id && !body.session_id) {
      return handleDirectCompletion(body, now, errors, warnings);
    }

    // === Method 3: Session-based (legacy) ===
    if (body.session_id && body.message) {
      return handleSessionCompletion(body, now, errors, warnings);
    }

    log('warn', 'AgentCompletion', 'Invalid payload structure', { body });
    return NextResponse.json(
      { 
        success: false, 
        message: 'Invalid payload. Use one of: (task_id + activity), (task_id + summary), or (session_id + message)',
        errors: ['Missing required fields']
      },
      { status: 400 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log('error', 'AgentCompletion', 'Unhandled exception', { error: msg });
    return NextResponse.json(
      { success: false, message: msg, errors: [msg] },
      { status: 500 }
    );
  }
}

// Handle activity-based completion (preferred method)
async function handleActivityCompletion(
  body: any, 
  now: string, 
  errors: string[], 
  warnings: string[]
): Promise<NextResponse<CompletionResult>> {
  const taskId = body.task_id;
  const activity = body.activity;
  const deliverables = body.deliverables || [];
  
  log('info', 'ActivityCompletion', 'Processing activity-based completion', { 
    taskId, 
    activityType: activity.activity_type 
  });
  
  // Get task
  const task = queryOne<Task & { assigned_agent_name?: string }>(
    `SELECT t.*, a.name as assigned_agent_name
     FROM tasks t
     LEFT JOIN agents a ON t.assigned_agent_id = a.id
     WHERE t.id = ?`,
    [taskId]
  );

  if (!task) {
    log('error', 'ActivityCompletion', 'Task not found', { taskId });
    return NextResponse.json(
      { success: false, message: 'Task not found', errors: ['Invalid task_id'] },
      { status: 404 }
    );
  }
  
  // Validate activity type
  if (activity.activity_type !== 'completed') {
    return NextResponse.json(
      { success: false, message: 'Invalid activity_type. Expected: "completed"', errors: ['Invalid activity type'] },
      { status: 400 }
    );
  }
  
  // Create activity record
  try {
    const activityId = uuidv4();
    run(
      `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        activityId,
        taskId,
        task.assigned_agent_id,
        activity.activity_type,
        activity.message || 'Task completed',
        now
      ]
    );
    log('info', 'ActivityCompletion', 'Activity record created', { 
      activityId, 
      taskId,
      agentId: task.assigned_agent_id 
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Database error';
    log('error', 'ActivityCompletion', 'Failed to create activity', { taskId, error: msg });
    errors.push(`Activity creation failed: ${msg}`);
    // Continue - don't fail the whole request
  }
  
  // Register deliverables if provided
  for (const d of deliverables) {
    try {
      run(
        `INSERT INTO task_deliverables (id, task_id, deliverable_type, title, path, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), taskId, d.type || 'file', d.title, d.path, d.description || '', now]
      );
      log('info', 'ActivityCompletion', 'Deliverable registered', { 
        taskId, 
        title: d.title, 
        path: d.path 
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Database error';
      warnings.push(`Deliverable registration failed: ${msg}`);
    }
  }
  
  // Move to TESTING status (automated verification step)
  // This allows the system to run tests before review
  const newStatus = 'testing';
  
  try {
    // Only update if currently in progress or assigned
    if (['assigned', 'in_progress'].includes(task.status)) {
      run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', [newStatus, now, taskId]);
      
      // Log completion event
      run(
        `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          'task_completed',
          task.assigned_agent_id,
          taskId,
          `${task.assigned_agent_name} completed: ${activity.message || 'Task finished'}`,
          now
        ]
      );
      
      // Set agent back to standby
      if (task.assigned_agent_id) {
        run(
          'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
          ['standby', now, task.assigned_agent_id]
        );
      }
      
      log('info', 'ActivityCompletion', 'Task moved to testing', { 
        taskId, 
        newStatus,
        previousStatus: task.status 
      });
    } else {
      log('warn', 'ActivityCompletion', 'Task already in advanced status, not moving to testing', {
        taskId,
        currentStatus: task.status
      });
      warnings.push(`Task status is ${task.status}, not moving to testing`);
    }
    
    return NextResponse.json({
      success: true,
      task_id: taskId,
      agent_id: task.assigned_agent_id,
      new_status: newStatus,
      message: 'Activity logged, task moved to testing for verification',
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    });
    
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Database error';
    log('error', 'ActivityCompletion', 'Failed to update task status', { taskId, error: msg });
    errors.push(`Task status update failed: ${msg}`);
    
    return NextResponse.json({
      success: false,
      task_id: taskId,
      message: 'Activity created but status update failed',
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    }, { status: 207 });  // Multi-status
  }
}

// Handle direct task completion (simple method)
async function handleDirectCompletion(
  body: any, 
  now: string, 
  errors: string[], 
  warnings: string[]
): Promise<NextResponse<CompletionResult>> {
  const taskId = body.task_id;
  const summary = body.summary || 'Task completed';
  const agentId = body.agent_id;
  
  log('info', 'DirectCompletion', 'Processing direct completion', { taskId, summary, agentId });
  
  const task = queryOne<Task & { assigned_agent_name?: string }>(
    `SELECT t.*, a.name as assigned_agent_name
     FROM tasks t
     LEFT JOIN agents a ON t.assigned_agent_id = a.id
     WHERE t.id = ?`,
    [taskId]
  );

  if (!task) {
    log('error', 'DirectCompletion', 'Task not found', { taskId });
    return NextResponse.json(
      { success: false, message: 'Task not found' },
      { status: 404 }
    );
  }
  
  // Determine agent ID
  const effectiveAgentId = agentId || task.assigned_agent_id;
  
  // For direct completion, we need to create the activity record first
  // Then move to testing
  try {
    run(
      `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), taskId, effectiveAgentId, 'completed', summary, now]
    );
    log('info', 'DirectCompletion', 'Completion activity created', { taskId, agentId: effectiveAgentId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Database error';
    log('warn', 'DirectCompletion', 'Failed to create activity (continuing)', { taskId, error: msg });
  }
  
  // Only move to testing if in progress or assigned
  if (['assigned', 'in_progress'].includes(task.status)) {
    run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', ['testing', now, taskId]);
    
    run(
      `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), 'task_completed', effectiveAgentId, taskId, summary, now]
    );
    
    if (effectiveAgentId) {
      run('UPDATE agents SET status = ?, updated_at = ? WHERE id = ?', ['standby', now, effectiveAgentId]);
    }
    
    log('info', 'DirectCompletion', 'Task moved to testing', { taskId });
    
    return NextResponse.json({
      success: true,
      task_id: taskId,
      agent_id: effectiveAgentId,
      new_status: 'testing',
      message: 'Task moved to testing for verification'
    });
  }
  
  log('info', 'DirectCompletion', 'Task already in advanced status', { taskId, currentStatus: task.status });
  
  return NextResponse.json({
    success: true,
    task_id: taskId,
    new_status: task.status,
    message: 'Task already in testing, review, or done status'
  });
}

// Handle session-based completion (legacy)
async function handleSessionCompletion(
  body: any, 
  now: string, 
  errors: string[], 
  warnings: string[]
): Promise<NextResponse<CompletionResult>> {
  const sessionId = body.session_id;
  const message = body.message;
  
  log('info', 'SessionCompletion', 'Processing session completion', { sessionId, messagePreview: message?.substring(0, 50) });
  
  // Parse TASK_COMPLETE message
  const completionMatch = message.match(/TASK_COMPLETE:\s*(.+)/i);
  if (!completionMatch) {
    log('warn', 'SessionCompletion', 'Invalid completion message format', { message });
    return NextResponse.json(
      { success: false, message: 'Invalid format. Expected: TASK_COMPLETE: [summary]' },
      { status: 400 }
    );
  }

  const summary = completionMatch[1].trim();
  
  // Find agent by session
  const session = queryOne<OpenClawSession>(
    'SELECT * FROM openclaw_sessions WHERE openclaw_session_id = ? AND status = ?',
    [sessionId, 'active']
  );

  let resolvedSession = session;
  
  if (!resolvedSession) {
    log('warn', 'SessionCompletion', 'Session not found, trying lookup by ID pattern', { sessionId });
    // Try looking up by partial match
    const sessions = queryAll<OpenClawSession>(
      'SELECT * FROM openclaw_sessions WHERE openclaw_session_id LIKE ? AND status = ?',
      [`%${sessionId}%`, 'active']
    );
    
    if (sessions.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Session not found or inactive. The task may have already been processed.' },
        { status: 404 }
      );
    }
    
    // Use the first matching session
    resolvedSession = sessions[0];
  }

  // Find active task for this agent
  const task = queryOne<Task & { assigned_agent_name?: string }>(
    `SELECT t.*, a.name as assigned_agent_name
     FROM tasks t
     LEFT JOIN agents a ON t.assigned_agent_id = a.id
     WHERE t.assigned_agent_id = ? 
       AND t.status IN ('assigned', 'in_progress')
     ORDER BY t.updated_at DESC
     LIMIT 1`,
    [resolvedSession.agent_id]
  );

  if (!task) {
    log('warn', 'SessionCompletion', 'No active task found for agent', { 
      agentId: resolvedSession.agent_id,
      sessionId 
    });
    return NextResponse.json(
      { success: false, message: 'No active task found for this agent' },
      { status: 404 }
    );
  }
  
  // Create completion activity
  try {
    run(
      `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), task.id, resolvedSession.agent_id, 'completed', summary, now]
    );
    log('info', 'SessionCompletion', 'Activity created for session completion', { 
      taskId: task.id, 
      summary 
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Database error';
    log('warn', 'SessionCompletion', 'Activity creation failed', { taskId: task.id, error: msg });
  }

  // Move to testing
  run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', ['testing', now, task.id]);
  
  run(
    `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      'task_completed',
      resolvedSession.agent_id,
      task.id,
      `${task.assigned_agent_name} completed: ${summary}`,
      now
    ]
  );

  // Set agent back to standby
  run(
    'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
    ['standby', now, resolvedSession.agent_id]
  );

  log('info', 'SessionCompletion', 'Session-based completion processed', {
    taskId: task.id,
    agentId: resolvedSession.agent_id,
    newStatus: 'testing'
  });

  return NextResponse.json({
    success: true,
    task_id: task.id,
    agent_id: resolvedSession.agent_id,
    summary,
    new_status: 'testing',
    message: 'Task moved to testing for verification'
  });
}

/**
 * GET /api/webhooks/agent-completion
 * 
 * Returns webhook status and recent completions
 */
export async function GET() {
  try {
    const recentCompletions = queryAll(
      `SELECT e.*, a.name as agent_name, t.title as task_title, t.status as current_status
       FROM events e
       LEFT JOIN agents a ON e.agent_id = a.id
       LEFT JOIN tasks t ON e.task_id = t.id
       WHERE e.type = 'task_completed'
       ORDER BY e.created_at DESC
       LIMIT 10`
    );

    // Get stats
    const stats = queryOne<{ total_today: number }>(
      `SELECT COUNT(1) as total_today
       FROM events
       WHERE type = 'task_completed'
         AND created_at > date('now')`
    );

    return NextResponse.json({
      status: 'active',
      endpoint: '/api/webhooks/agent-completion',
      methods_supported: ['task_id + activity', 'task_id + summary', 'session_id + message'],
      completions_today: stats?.total_today || 0,
      recent_completions: recentCompletions
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log('error', 'Status', 'Failed to fetch status', { error: msg });
    return NextResponse.json(
      { error: 'Failed to fetch status' },
      { status: 500 }
    );
  }
}
