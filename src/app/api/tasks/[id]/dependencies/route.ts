import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { TaskDependency, Task } from '@/lib/types';

// GET /api/tasks/[id]/dependencies - List dependencies in both directions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Tasks this task depends on (must complete before this task)
    const dependsOn = queryAll<TaskDependency & { dependency_title: string; dependency_status: string }>(
      `SELECT td.*, t.title as dependency_title, t.status as dependency_status
       FROM task_dependencies td
       JOIN tasks t ON td.dependency_id = t.id
       WHERE td.task_id = ?
       ORDER BY td.created_at DESC`,
      [id]
    );

    // Tasks that depend on this task (blocked by this task)
    const blocking = queryAll<TaskDependency & { dependent_title: string; dependent_status: string }>(
      `SELECT td.*, t.title as dependent_title, t.status as dependent_status
       FROM task_dependencies td
       JOIN tasks t ON td.task_id = t.id
       WHERE td.dependency_id = ?
       ORDER BY td.created_at DESC`,
      [id]
    );

    return NextResponse.json({ depends_on: dependsOn, blocking });
  } catch (error) {
    console.error('Failed to fetch dependencies:', error);
    return NextResponse.json({ error: 'Failed to fetch dependencies' }, { status: 500 });
  }
}

// POST /api/tasks/[id]/dependencies - Add a dependency
// Body: { dependency_id: string }
// Means: task [id] depends on task [dependency_id]
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const { dependency_id: depId } = await request.json();

    if (!depId) {
      return NextResponse.json({ error: 'dependency_id is required' }, { status: 400 });
    }

    if (taskId === depId) {
      return NextResponse.json({ error: 'A task cannot depend on itself' }, { status: 400 });
    }

    // Verify both tasks exist
    const task = queryOne<Task>('SELECT id, title FROM tasks WHERE id = ?', [taskId]);
    const dep = queryOne<Task>('SELECT id, title FROM tasks WHERE id = ?', [depId]);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    if (!dep) {
      return NextResponse.json({ error: 'Dependency task not found' }, { status: 404 });
    }

    // Check for existing dependency
    const existing = queryOne(
      'SELECT 1 FROM task_dependencies WHERE task_id = ? AND dependency_id = ?',
      [taskId, depId]
    );
    if (existing) {
      return NextResponse.json({ error: 'Dependency already exists' }, { status: 409 });
    }

    // Cycle detection: DFS from depId to see if we can reach taskId
    if (wouldCreateCycle(taskId, depId)) {
      return NextResponse.json(
        { error: 'Adding this dependency would create a circular dependency' },
        { status: 409 }
      );
    }

    // Insert dependency
    run(
      'INSERT INTO task_dependencies (task_id, dependency_id) VALUES (?, ?)',
      [taskId, depId]
    );

    // Broadcast update for both tasks
    broadcast({ type: 'dependency_changed', payload: { taskId, dependencyId: depId } });

    return NextResponse.json({ task_id: taskId, dependency_id: depId }, { status: 201 });
  } catch (error) {
    console.error('Failed to add dependency:', error);
    return NextResponse.json({ error: 'Failed to add dependency' }, { status: 500 });
  }
}

/**
 * Check if adding an edge (taskId depends on depId) would create a cycle.
 * We do DFS from depId following existing "depends on" edges.
 * If we can reach taskId, adding this edge would close a cycle.
 */
function wouldCreateCycle(taskId: string, depId: string): boolean {
  const visited = new Set<string>();
  const stack = [depId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    // Get what `current` depends on
    const deps = queryAll<{ dependency_id: string }>(
      'SELECT dependency_id FROM task_dependencies WHERE task_id = ?',
      [current]
    );
    for (const d of deps) {
      if (!visited.has(d.dependency_id)) {
        stack.push(d.dependency_id);
      }
    }
  }

  return false;
}
