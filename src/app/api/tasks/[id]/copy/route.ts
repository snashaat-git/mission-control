// API endpoint to copy/duplicate a task
// POST /api/tasks/[id]/copy - Creates a copy of the task in inbox

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Task } from '@/lib/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { 
      copy_title = true,
      copy_description = true,
      copy_assigned_agent = false,
      copy_output_dir = false,
      copy_priority = true,
      title_suffix = ' (Copy)'
    } = body;

    // Get the original task
    const originalTask = queryOne<Task>(
      `SELECT t.*, a.name as assigned_agent_name
       FROM tasks t
       LEFT JOIN agents a ON t.assigned_agent_id = a.id
       WHERE t.id = ?`,
      [id]
    );

    if (!originalTask) {
      return NextResponse.json(
        { error: 'Original task not found' },
        { status: 404 }
      );
    }

    // Create new task ID
    const newTaskId = uuidv4();
    const now = new Date().toISOString();

    // Build the new task
    const newTitle = copy_title 
      ? `${originalTask.title}${title_suffix}` 
      : 'New Task';
    
    const newDescription = copy_description 
      ? originalTask.description 
      : null;
    
    const newAssignedAgentId = copy_assigned_agent 
      ? originalTask.assigned_agent_id 
      : null;
    
    const newOutputDir = copy_output_dir && originalTask.output_dir
      ? `${originalTask.output_dir}-copy-${Date.now()}`
      : null;
    
    const newPriority = copy_priority 
      ? originalTask.priority 
      : 'normal';

    // Insert the new task
    run(
      `INSERT INTO tasks (
        id, title, description, status, priority, 
        assigned_agent_id, business_id, output_dir, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newTaskId,
        newTitle,
        newDescription,
        'inbox', // Always start in inbox
        newPriority,
        newAssignedAgentId,
        originalTask.business_id,
        newOutputDir,
        now,
        now
      ]
    );

    // Log the copy event
    run(
      `INSERT INTO events (id, type, task_id, message, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        'task_created',
        newTaskId,
        `Task copied from "${originalTask.title}"`,
        now
      ]
    );

    // Log activity on the original task
    run(
      `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        id,
        'updated',
        `Copied to new task: "${newTitle}"`,
        now
      ]
    );

    // Fetch the newly created task
    const newTask = queryOne<Task & { assigned_agent_name?: string; assigned_agent_emoji?: string }>(
      `SELECT t.*,
        a.name as assigned_agent_name,
        a.avatar_emoji as assigned_agent_emoji
       FROM tasks t
       LEFT JOIN agents a ON t.assigned_agent_id = a.id
       WHERE t.id = ?`,
      [newTaskId]
    );

    // Broadcast the new task
    if (newTask) {
      broadcast({ type: 'task_created', payload: newTask });
    }

    return NextResponse.json({
      success: true,
      message: 'Task copied successfully',
      original_task: {
        id: originalTask.id,
        title: originalTask.title
      },
      new_task: newTask
    }, { status: 201 });

  } catch (error) {
    console.error('Error copying task:', error);
    return NextResponse.json(
      { error: 'Failed to copy task', details: (error as Error).message },
      { status: 500 }
    );
  }
}
