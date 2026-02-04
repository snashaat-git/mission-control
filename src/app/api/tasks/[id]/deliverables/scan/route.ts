import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { queryOne, queryAll, run } from '@/lib/db';
import { getProjectsPath } from '@/lib/config';
import { broadcast } from '@/lib/events';
import type { Task, TaskDeliverable } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/tasks/[id]/deliverables/scan
// Scans the task output directory and registers any files as deliverables.
export async function POST(_req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const projectsPath = getProjectsPath();

    // Prefer persisted output_dir (robust against title edits)
    const taskProjectDir = (task as any).output_dir
      ? String((task as any).output_dir)
      : `${projectsPath}/${task.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')}`;

    if (!fs.existsSync(taskProjectDir) || !fs.statSync(taskProjectDir).isDirectory()) {
      return NextResponse.json({ error: 'Output directory not found', dir: taskProjectDir }, { status: 404 });
    }

    const entries = fs.readdirSync(taskProjectDir, { withFileTypes: true });
    let created = 0;
    const now = new Date().toISOString();

    for (const ent of entries) {
      if (!ent.isFile()) continue;
      const fullPath = path.join(taskProjectDir, ent.name);

      const exists = queryOne<{ c: number }>(
        'SELECT COUNT(1) as c FROM task_deliverables WHERE task_id = ? AND path = ?',
        [task.id, fullPath]
      );
      if (exists && exists.c > 0) continue;

      run(
        `INSERT INTO task_deliverables (id, task_id, deliverable_type, title, path, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), task.id, 'file', ent.name, fullPath, 'Manually scanned deliverable', now]
      );
      created++;
    }

    // Return updated deliverables list
    const deliverables = queryAll<TaskDeliverable>(
      'SELECT * FROM task_deliverables WHERE task_id = ? ORDER BY created_at DESC',
      [task.id]
    );

    // Broadcast task update so UI can refresh if needed
    broadcast({ type: 'task_updated', payload: task });

    return NextResponse.json({ ok: true, created, dir: taskProjectDir, deliverables });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to scan deliverables' },
      { status: 500 }
    );
  }
}
