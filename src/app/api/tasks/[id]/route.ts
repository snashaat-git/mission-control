import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run, queryAll } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { getMissionControlUrl } from '@/lib/config';
import type { Task, UpdateTaskRequest, Agent, TaskDeliverable } from '@/lib/types';

// Logger for task operations
function log(level: 'info' | 'warn' | 'error', context: string, message: string, meta?: Record<string, unknown>) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    context: `[Task:${context}]`,
    message,
    ...meta
  };
  
  if (level === 'error') console.error(JSON.stringify(logEntry));
  else if (level === 'warn') console.warn(JSON.stringify(logEntry));
  else console.log(JSON.stringify(logEntry));
}

// Valid workflow transitions
// Format: from_status -> allowed_to_statuses[]
const WORKFLOW_RULES: Record<string, string[]> = {
  'inbox': ['assigned', 'cancelled'],
  'assigned': ['in_progress', 'inbox', 'cancelled'],
  'in_progress': ['testing', 'assigned', 'cancelled'],
  'testing': ['review', 'assigned', 'in_progress', 'cancelled'],
  'review': ['done', 'assigned', 'in_progress', 'cancelled'],
  'done': ['assigned', 'in_progress', 'cancelled'],  // For rework
  'cancelled': ['inbox']  // For revival
};

// Who can initiate which transitions
// user = anyone (including human UI)
// agent = non-master agent
// master = master agent only
// system = automated (webhooks, etc)
const TRANSITION_PERMISSIONS: Record<string, Record<string, 'user' | 'agent' | 'master' | 'system'>> = {
  'inbox->assigned': { default: 'user' },
  'assigned->in_progress': { default: 'system' },  // Auto when dispatch succeeds
  'in_progress->testing': { default: 'system' },  // Auto when agent calls webhook
  'testing->review': { default: 'user' },  // After human verifies tests
  'review->done': { default: 'user' },  // User (human) can mark as done
  'review->assigned': { default: 'user' },  // User can reject to rework
  '*->cancelled': { default: 'user' },
  'done->assigned': { default: 'user' },  // User can send back for rework
  'cancelled->inbox': { default: 'user' }
};

// Helper to check if transition is valid
function isValidTransition(from: string, to: string): boolean {
  const allowed = WORKFLOW_RULES[from] || [];
  return allowed.includes(to);
}

// Helper to check transition permission
function hasTransitionPermission(
  from: string, 
  to: string, 
  actorType: 'user' | 'agent' | 'master' | 'system'
): { allowed: boolean; reason?: string } {
  // Check workflow validity first
  if (!isValidTransition(from, to)) {
    return { 
      allowed: false, 
      reason: `Invalid transition: ${from} -> ${to}. Allowed from ${from}: ${WORKFLOW_RULES[from]?.join(', ') || 'none'}` 
    };
  }
  
  // Get permission rule
  const rule = TRANSITION_PERMISSIONS[`${from}->${to}`] || TRANSITION_PERMISSIONS['*->cancelled'];
  if (!rule) {
    // Default: allow user, block agents
    if (actorType === 'user' || actorType === 'system') return { allowed: true };
    return { allowed: false, reason: `Transition ${from} -> ${to} requires manual approval` };
  }
  
  const required = rule.default;
  
  // Check permission hierarchy
  const hierarchy = { user: 0, system: 1, agent: 2, master: 3 };
  if (hierarchy[actorType] >= hierarchy[required]) {
    return { allowed: true };
  }
  
  return { 
    allowed: false, 
    reason: `Transition ${from} -> ${to} requires ${required} privileges, but actor has ${actorType}` 
  };
}

// GET /api/tasks/[id] - Get a single task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const context = { taskId: '' };
  
  try {
    const { id } = await params;
    context.taskId = id;
    
    log('info', 'Get', 'Fetching task', { taskId: id });
    
    const task = queryOne<Task & { assigned_agent_name?: string; assigned_agent_emoji?: string }>(
      `SELECT t.*,
        aa.name as assigned_agent_name,
        aa.avatar_emoji as assigned_agent_emoji
       FROM tasks t
       LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
       WHERE t.id = ?`,
      [id]
    );

    if (!task) {
      log('warn', 'Get', 'Task not found', { taskId: id });
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    
    log('info', 'Get', 'Task retrieved', { taskId: id, title: task.title, status: task.status });
    return NextResponse.json(task);
    
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log('error', 'Get', 'Failed to fetch task', { taskId: context.taskId, error: msg });
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

// PATCH /api/tasks/[id] - Update a task
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    const { id } = await params;
    const body: UpdateTaskRequest & { updated_by_agent_id?: string; actor_type?: 'user' | 'agent' | 'master' | 'system' } = await request.json();
    const now = new Date().toISOString();
    
    log('info', 'Patch', 'Starting task update', { taskId: id, body });
    
    // Get existing task
    const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!existing) {
      log('warn', 'Patch', 'Task not found', { taskId: id });
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    
    // Resolve actor type
    let actorType: 'user' | 'agent' | 'master' | 'system' = body.actor_type || 'user';
    const actorId = body.updated_by_agent_id;
    
    // If agent_id provided but actor_type not specified, look up agent
    if (actorId && !body.actor_type) {
      const agent = queryOne<Agent>('SELECT is_master FROM agents WHERE id = ?', [actorId]);
      actorType = agent?.is_master ? 'master' : 'agent';
    }
    
    log('info', 'Patch', 'Actor resolved', { 
      taskId: id, 
      actorType, 
      actorId,
      currentStatus: existing.status 
    });

    // Workflow enforcement for status changes
    if (body.status && body.status !== existing.status) {
      const permission = hasTransitionPermission(existing.status, body.status, actorType);
      
      if (!permission.allowed) {
        log('warn', 'Patch', 'Blocked workflow transition', {
          taskId: id,
          from: existing.status,
          to: body.status,
          actorType,
          reason: permission.reason
        });
        
        return NextResponse.json(
          { 
            error: 'Workflow transition blocked',
            detail: permission.reason,
            current_status: existing.status,
            requested_status: body.status
          },
          { status: 403 }
        );
      }
      
      // Additional validation for specific transitions
      
      // * -> review requires completion evidence if initiated by agent
      if (body.status === 'review' && actorType === 'agent') {
        const completed = queryOne<{ c: number }>(
          'SELECT COUNT(1) as c FROM task_activities WHERE task_id = ? AND activity_type = ?',
          [id, 'completed']
        );
        
        if (!completed || completed.c === 0) {
          log('warn', 'Patch', 'Agent blocked from review without completion evidence', {
            taskId: id,
            actorId,
            actorType
          });
          
          return NextResponse.json(
            { 
              error: 'Cannot move to REVIEW',
              detail: 'Agent must log a completed activity with TASK_COMPLETE message first',
              hint: 'Call POST /api/tasks/{id}/activities with {"activity_type": "completed"}'
            },
            { status: 409 }
          );
        }
        
        log('info', 'Patch', 'Completion evidence verified for review transition', {
          taskId: id,
          completedActivities: completed.c
        });
      }
      
      // Testing -> Review might require automated checks
      if (existing.status === 'testing' && body.status === 'review') {
        // Check if there are recent failed tests that might block this
        const recentFailures = queryOne<{ c: number }>(
          `SELECT COUNT(1) as c FROM events 
           WHERE task_id = ? 
             AND type = 'test_failed' 
             AND created_at > datetime('now', '-1 hour')`,
          [id]
        );
        
        if (recentFailures && recentFailures.c > 0) {
          warnings.push(`${recentFailures.c} recent test failures detected. Review carefully.`);
          log('warn', 'Patch', 'Moving to review despite recent test failures', {
            taskId: id,
            failureCount: recentFailures.c
          });
        }
      }
      
      log('info', 'Patch', 'Workflow transition approved', {
        taskId: id,
        from: existing.status,
        to: body.status,
        actorType
      });
    }

    // Build update
    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.title !== undefined) {
      updates.push('title = ?');
      values.push(body.title);
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description);
    }
    if (body.priority !== undefined) {
      updates.push('priority = ?');
      values.push(body.priority);
    }
    if (body.due_date !== undefined) {
      updates.push('due_date = ?');
      values.push(body.due_date);
    }
    if ((body as any).output_dir !== undefined) {
      updates.push('output_dir = ?');
      values.push((body as any).output_dir);
    }

    // Track if we need to dispatch task
    let shouldDispatch = false;

    // Handle status change
    if (body.status !== undefined && body.status !== existing.status) {
      updates.push('status = ?');
      values.push(body.status);

      // Auto-dispatch when moving to assigned
      if (body.status === 'assigned' && (body.assigned_agent_id || existing.assigned_agent_id)) {
        shouldDispatch = true;
      }

      // Log status change event
      const eventType = body.status === 'done' ? 'task_completed' : 'task_status_changed';
      run(
        `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), eventType, actorId || null, id, `Task "${existing.title}" moved to ${body.status}`, now]
      );
      
      log('info', 'Patch', 'Status change event logged', {
        taskId: id,
        eventType,
        from: existing.status,
        to: body.status
      });
    }

    // Handle assignment change
    if (body.assigned_agent_id !== undefined && body.assigned_agent_id !== existing.assigned_agent_id) {
      updates.push('assigned_agent_id = ?');
      values.push(body.assigned_agent_id);

      if (body.assigned_agent_id) {
        const agent = queryOne<Agent>('SELECT name FROM agents WHERE id = ?', [body.assigned_agent_id]);
        if (agent) {
          run(
            `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), 'task_assigned', body.assigned_agent_id, id, `"${existing.title}" assigned to ${agent.name}`, now]
          );
          
          log('info', 'Patch', 'Task reassigned', {
            taskId: id,
            newAgentId: body.assigned_agent_id,
            newAgentName: agent.name
          });

          // Auto-dispatch if already in assigned status or being assigned now
          if (existing.status === 'assigned' || body.status === 'assigned') {
            shouldDispatch = true;
          }
        }
      }
    }

    if (updates.length === 0) {
      log('warn', 'Patch', 'No updates provided', { taskId: id });
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    // Execute update
    try {
      run(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, values);
      log('info', 'Patch', 'Task updated successfully', { taskId: id, fieldsUpdated: updates.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Database error';
      log('error', 'Patch', 'Database update failed', { taskId: id, error: msg });
      return NextResponse.json({ error: 'Database update failed', detail: msg }, { status: 500 });
    }

    // Fetch updated task
    const task = queryOne<Task>(
      `SELECT t.*,
        aa.name as assigned_agent_name,
        aa.avatar_emoji as assigned_agent_emoji,
        ca.name as created_by_agent_name,
        ca.avatar_emoji as created_by_agent_emoji
       FROM tasks t
       LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
       LEFT JOIN agents ca ON t.created_by_agent_id = ca.id
       WHERE t.id = ?`,
      [id]
    );

    // Broadcast update
    if (task) {
      broadcast({ type: 'task_updated', payload: task });
    }

    // Trigger auto-dispatch if needed
    if (shouldDispatch && task?.assigned_agent_id) {
      const alreadyDispatched = queryOne<{ c: number }>(
        'SELECT COUNT(1) as c FROM events WHERE task_id = ? AND type = ? AND created_at > ?',
        [id, 'task_dispatched', existing.updated_at]
      );
      const isInProgress = task?.status === 'in_progress';
      
      if ((alreadyDispatched && alreadyDispatched.c > 0) || isInProgress) {
        log('info', 'Patch', 'Skipping duplicate dispatch', {
          taskId: id,
          alreadyDispatched: alreadyDispatched?.c,
          isInProgress
        });
      } else {
        log('info', 'Patch', 'Triggering auto-dispatch', { taskId: id });
        
        const missionControlUrl = getMissionControlUrl();
        fetch(`${missionControlUrl}/api/tasks/${id}/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }).catch(err => {
          log('error', 'Patch', 'Auto-dispatch failed', { 
            taskId: id, 
            error: err instanceof Error ? err.message : 'Unknown' 
          });
        });
      }
    }

    // Note: Antigravity Bridge integration removed - desktop app limitations
    
    const response: any = task;
    if (warnings.length > 0) {
      response.warnings = warnings;
    }

    return NextResponse.json(response);
    
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log('error', 'Patch', 'Unhandled exception', { taskId: params, error: msg });
    return NextResponse.json({ error: 'Failed to update task', detail: msg }, { status: 500 });
  }
}

// DELETE /api/tasks/[id] - Delete a task
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    log('info', 'Delete', 'Deleting task', { taskId: id });
    
    const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!existing) {
      log('warn', 'Delete', 'Task not found', { taskId: id });
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Delete related records
    run('DELETE FROM openclaw_sessions WHERE task_id = ?', [id]);
    run('DELETE FROM events WHERE task_id = ?', [id]);
    run('UPDATE conversations SET task_id = NULL WHERE task_id = ?', [id]);

    // Delete task (cascades to activities and deliverables)
    run('DELETE FROM tasks WHERE id = ?', [id]);
    
    log('info', 'Delete', 'Task deleted', { taskId: id, title: existing.title });

    broadcast({ type: 'task_deleted', payload: { id } });
    return NextResponse.json({ success: true });
    
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log('error', 'Delete', 'Delete failed', { taskId: params, error: msg });
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
