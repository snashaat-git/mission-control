import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run, queryAll } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { getMissionControlUrl } from '@/lib/config';
import type { Task, UpdateTaskRequest, Agent, TaskDeliverable } from '@/lib/types';

// GET /api/tasks/[id] - Get a single task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = queryOne<Task>(
      `SELECT t.*,
        aa.name as assigned_agent_name,
        aa.avatar_emoji as assigned_agent_emoji
       FROM tasks t
       LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
       WHERE t.id = ?`,
      [id]
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('Failed to fetch task:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

// PATCH /api/tasks/[id] - Update a task
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: UpdateTaskRequest & { updated_by_agent_id?: string } = await request.json();

    const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    const now = new Date().toISOString();

    // Auto-resolve updated_by_agent_id from task assignment if not provided
    let resolvedUpdaterId = body.updated_by_agent_id;
    if (!resolvedUpdaterId && existing.assigned_agent_id) {
      resolvedUpdaterId = existing.assigned_agent_id;
      console.log('[PATCH] Auto-resolved updated_by_agent_id from task assignment:', resolvedUpdaterId);
    }

    // Workflow enforcement
    // - Agent-initiated review→done requires master agent
    // - Agent-initiated *→review requires completion evidence (task_activities.completed)
    // - User-initiated moves (no updated_by_agent_id) are allowed
    if (body.status === 'review' && existing.status !== 'review' && resolvedUpdaterId) {
      const completed = queryOne<{ c: number }>(
        'SELECT COUNT(1) as c FROM task_activities WHERE task_id = ? AND activity_type = ?',
        [id, 'completed']
      );
      console.log('[PATCH] Checking completion evidence for review transition:', { taskId: id, completedCount: completed?.c || 0 });
      if (!completed || completed.c === 0) {
        console.log('[PATCH] BLOCKED: Cannot move to review without completed activity');
        return NextResponse.json(
          { error: 'Cannot move task to REVIEW without completion evidence (TASK_COMPLETE / completed activity)' },
          { status: 409 }
        );
      }
    }

    if (body.status === 'done' && existing.status === 'review' && resolvedUpdaterId) {
      const updatingAgent = queryOne<Agent>(
        'SELECT is_master FROM agents WHERE id = ?',
        [resolvedUpdaterId]
      );

      if (!updatingAgent || !updatingAgent.is_master) {
        console.log('[PATCH] BLOCKED: Only master agent can approve tasks');
        return NextResponse.json(
          { error: 'Forbidden: only master agent (Charlie) can approve tasks' },
          { status: 403 }
        );
      }
    }

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
      if (body.status === 'assigned' && existing.assigned_agent_id) {
        shouldDispatch = true;
      }

      // Log status change event
      const eventType = body.status === 'done' ? 'task_completed' : 'task_status_changed';
      run(
        `INSERT INTO events (id, type, task_id, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), eventType, id, `Task "${existing.title}" moved to ${body.status}`, now]
      );
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

          // Auto-dispatch if already in assigned status or being assigned now
          if (existing.status === 'assigned' || body.status === 'assigned') {
            shouldDispatch = true;
          }
        }
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    run(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, values);

    // Fetch updated task with all joined fields
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

    // Broadcast task update via SSE
    if (task) {
      broadcast({
        type: 'task_updated',
        payload: task,
      });
    }

    // Trigger auto-dispatch if needed (but only if not already dispatched/in_progress)
    if (shouldDispatch) {
      // Check if already dispatched to prevent duplicates
      const alreadyDispatched = queryOne<{ c: number }>(
        'SELECT COUNT(1) as c FROM events WHERE task_id = ? AND type = ? AND created_at > ?',
        [id, 'task_dispatched', existing.updated_at]
      );
      const isInProgress = task?.status === 'in_progress';
      
      if ((alreadyDispatched && alreadyDispatched.c > 0) || isInProgress) {
        console.log('[PATCH] Skipping duplicate dispatch:', { taskId: id, alreadyDispatched: alreadyDispatched?.c, isInProgress });
      } else {
        console.log('[PATCH] Triggering auto-dispatch for task:', id);
        // Call dispatch endpoint asynchronously (don't wait for response)
        const missionControlUrl = getMissionControlUrl();
        fetch(`${missionControlUrl}/api/tasks/${id}/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }).catch(err => {
          console.error('Auto-dispatch failed:', err);
        });
      }
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('Failed to update task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

// DELETE /api/tasks/[id] - Delete a task
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);

    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Delete or nullify related records first (foreign key constraints)
    // Note: task_activities and task_deliverables have ON DELETE CASCADE
    run('DELETE FROM openclaw_sessions WHERE task_id = ?', [id]);
    run('DELETE FROM events WHERE task_id = ?', [id]);
    // Conversations reference tasks - nullify or delete
    run('UPDATE conversations SET task_id = NULL WHERE task_id = ?', [id]);

    // Now delete the task (cascades to task_activities and task_deliverables)
    run('DELETE FROM tasks WHERE id = ?', [id]);

    // Broadcast deletion via SSE
    broadcast({
      type: 'task_deleted',
      payload: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete task:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
