import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';

// DELETE /api/tasks/[id]/dependencies/[depId] - Remove a dependency
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; depId: string }> }
) {
  try {
    const { id: taskId, depId } = await params;

    const existing = queryOne(
      'SELECT 1 FROM task_dependencies WHERE task_id = ? AND dependency_id = ?',
      [taskId, depId]
    );

    if (!existing) {
      return NextResponse.json({ error: 'Dependency not found' }, { status: 404 });
    }

    run(
      'DELETE FROM task_dependencies WHERE task_id = ? AND dependency_id = ?',
      [taskId, depId]
    );

    broadcast({ type: 'dependency_changed', payload: { taskId, dependencyId: depId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to remove dependency:', error);
    return NextResponse.json({ error: 'Failed to remove dependency' }, { status: 500 });
  }
}
