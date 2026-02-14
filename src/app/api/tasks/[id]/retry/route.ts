import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run, transaction } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Task } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/tasks/[id]/retry
 * Retry a failed task: resets status to assigned (or inbox), increments retry_count.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const now = new Date().toISOString();

    const task = queryOne<Task>(
      'SELECT * FROM tasks WHERE id = ?',
      [id]
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (task.status !== 'failed') {
      return NextResponse.json(
        { error: `Cannot retry task in "${task.status}" status. Only failed tasks can be retried.` },
        { status: 400 }
      );
    }

    const retryCount = (task.retry_count ?? 0) + 1;
    const newStatus = task.assigned_agent_id ? 'assigned' : 'inbox';

    transaction(() => {
      run(
        'UPDATE tasks SET status = ?, retry_count = ?, updated_at = ? WHERE id = ?',
        [newStatus, retryCount, now, id]
      );

      run(
        `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(), id, task.assigned_agent_id || null, 'retried',
          `Manual retry (attempt ${retryCount})`,
          JSON.stringify({ retry_count: retryCount }),
          now,
        ]
      );

      run(
        `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), 'task_retried', task.assigned_agent_id || null, id, `Task "${task.title}" manually retried (attempt ${retryCount})`, now]
      );
    });

    const updated = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (updated) {
      broadcast({ type: 'task_updated', payload: updated });
    }

    return NextResponse.json({
      success: true,
      task: updated,
      retry_count: retryCount,
      new_status: newStatus,
    });
  } catch (error) {
    console.error('Failed to retry task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
