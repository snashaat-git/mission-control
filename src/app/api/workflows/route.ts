import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { getWorkflowById, WORKFLOW_TEMPLATES } from '@/lib/templates';
import type { Task } from '@/lib/types';

// GET /api/workflows - List available workflow templates
export async function GET() {
  return NextResponse.json(
    WORKFLOW_TEMPLATES.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      icon: w.icon,
      stepCount: w.steps.length,
      steps: w.steps.map((s) => s.stepLabel),
    }))
  );
}

// POST /api/workflows - Execute a workflow (create all tasks with dependencies)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const workflow_id: string = body.workflow_id;
    const replacements: Record<string, string> = body.replacements || {};

    if (!workflow_id) {
      return NextResponse.json({ error: 'workflow_id is required' }, { status: 400 });
    }

    const workflow = getWorkflowById(workflow_id);
    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const createdTaskIds: string[] = [];
    const createdTasks: Task[] = [];

    // Create each task
    for (const step of workflow.steps) {
      const id = uuidv4();
      createdTaskIds.push(id);

      // Apply placeholder replacements
      let title = step.defaults.title;
      let description = step.defaults.description;
      let outputDir = step.defaults.output_dir || null;

      for (const [key, value] of Object.entries(replacements)) {
        const placeholder = `[${key}]`;
        title = title.replaceAll(placeholder, value);
        description = description.replaceAll(placeholder, value);
        if (outputDir) {
          outputDir = outputDir.replaceAll(
            placeholder,
            value.toLowerCase().replace(/[^a-z0-9]+/g, '-')
          );
        }
      }

      run(
        `INSERT INTO tasks (id, title, description, priority, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, title, description, step.defaults.priority, 'inbox', now, now]
      );

      // Log event
      run(
        `INSERT INTO events (id, type, task_id, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), 'task_created', id, `Workflow "${workflow.name}" → ${step.stepLabel}: ${title}`, now]
      );

      // Log activity
      run(
        `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), id, 'updated', `Task created via workflow "${workflow.name}" (step: ${step.stepLabel})`, now]
      );
    }

    // Create dependencies between steps
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      for (const depIndex of step.dependsOnSteps) {
        run(
          'INSERT INTO task_dependencies (task_id, dependency_id) VALUES (?, ?)',
          [createdTaskIds[i], createdTaskIds[depIndex]]
        );
      }
    }

    // Fetch and broadcast all created tasks
    for (const id of createdTaskIds) {
      const task = queryOne<Task>(
        `SELECT t.*,
          aa.name as assigned_agent_name,
          aa.avatar_emoji as assigned_agent_emoji
         FROM tasks t
         LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
         WHERE t.id = ?`,
        [id]
      );
      if (task) {
        createdTasks.push(task);
        broadcast({ type: 'task_created', payload: task });
      }
    }

    // Broadcast dependency changes so UI re-fetches dependency metadata
    broadcast({ type: 'dependency_changed', payload: { workflowId: workflow_id } });

    return NextResponse.json(createdTasks, { status: 201 });
  } catch (error) {
    console.error('Failed to execute workflow:', error);
    return NextResponse.json({ error: 'Failed to execute workflow' }, { status: 500 });
  }
}
