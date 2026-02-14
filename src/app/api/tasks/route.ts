import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Task, CreateTaskRequest, Agent } from '@/lib/types';

// GET /api/tasks - List all tasks with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const businessId = searchParams.get('business_id');
    const assignedAgentId = searchParams.get('assigned_agent_id');

    let sql = `
      SELECT
        t.*,
        aa.name as assigned_agent_name,
        aa.avatar_emoji as assigned_agent_emoji,
        ca.name as created_by_agent_name
      FROM tasks t
      LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
      LEFT JOIN agents ca ON t.created_by_agent_id = ca.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (status) {
      // Support comma-separated status values (e.g., status=inbox,testing,in_progress)
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        sql += ' AND t.status = ?';
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        sql += ` AND t.status IN (${statuses.map(() => '?').join(',')})`;
        params.push(...statuses);
      }
    }
    if (businessId) {
      sql += ' AND t.business_id = ?';
      params.push(businessId);
    }
    if (assignedAgentId) {
      sql += ' AND t.assigned_agent_id = ?';
      params.push(assignedAgentId);
    }

    sql += ' ORDER BY t.created_at DESC';

    const tasks = queryAll<Task & { assigned_agent_name?: string; assigned_agent_emoji?: string; created_by_agent_name?: string }>(sql, params);

    // Fetch dependency metadata for all tasks in one query
    const depCounts = queryAll<{ task_id: string; dep_count: number; has_incomplete: number }>(
      `SELECT td.task_id,
              COUNT(*) as dep_count,
              SUM(CASE WHEN t.status != 'done' THEN 1 ELSE 0 END) as has_incomplete
       FROM task_dependencies td
       JOIN tasks t ON td.dependency_id = t.id
       GROUP BY td.task_id`
    );
    const blockingCounts = queryAll<{ dependency_id: string; blocking_count: number }>(
      `SELECT dependency_id, COUNT(*) as blocking_count
       FROM task_dependencies
       GROUP BY dependency_id`
    );

    const depMap = new Map(depCounts.map(d => [d.task_id, d]));
    const blockMap = new Map(blockingCounts.map(b => [b.dependency_id, b.blocking_count]));

    // Transform to include nested agent info and dependency metadata
    const transformedTasks = tasks.map((task) => {
      const dep = depMap.get(task.id);
      return {
        ...task,
        assigned_agent: task.assigned_agent_id
          ? {
              id: task.assigned_agent_id,
              name: task.assigned_agent_name,
              avatar_emoji: task.assigned_agent_emoji,
            }
          : undefined,
        dependency_count: dep?.dep_count ?? 0,
        blocking_count: blockMap.get(task.id) ?? 0,
        is_blocked: (dep?.has_incomplete ?? 0) > 0,
      };
    });

    return NextResponse.json(transformedTasks);
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

// POST /api/tasks - Create a new task
export async function POST(request: NextRequest) {
  try {
    const body: CreateTaskRequest = await request.json();
    console.log('[POST /api/tasks] Received body:', JSON.stringify(body));

    if (!body.title) {
      console.log('[POST /api/tasks] Title missing or empty');
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    run(
      `INSERT INTO tasks (id, title, description, priority, assigned_agent_id, created_by_agent_id, business_id, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.title,
        body.description || null,
        body.priority || 'normal',
        body.assigned_agent_id || null,
        body.created_by_agent_id || null,
        body.business_id || 'default',
        body.due_date || null,
        now,
        now,
      ]
    );

    // Log event
    let eventMessage = `New task: ${body.title}`;
    if (body.created_by_agent_id) {
      const creator = queryOne<Agent>('SELECT name FROM agents WHERE id = ?', [body.created_by_agent_id]);
      if (creator) {
        eventMessage = `${creator.name} created task: ${body.title}`;
      }
    }

    run(
      `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), 'task_created', body.created_by_agent_id || null, id, eventMessage, now]
    );

    // Log to task_activities (for Activity tab visibility)
    run(
      `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), id, body.created_by_agent_id || null, 'updated', `Task created: ${body.title}`, now]
    );

    // If assigned on creation, log assignment activity
    if (body.assigned_agent_id) {
      const assignedAgent = queryOne<Agent>('SELECT name FROM agents WHERE id = ?', [body.assigned_agent_id]);
      const assignMsg = assignedAgent 
        ? `Task assigned to ${assignedAgent.name}`
        : 'Task assigned to agent';
      
      run(
        `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, body.assigned_agent_id, 'updated', assignMsg, now]
      );
    }

    // Fetch created task with all joined fields
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
    
    // Broadcast task creation via SSE
    if (task) {
      broadcast({
        type: 'task_created',
        payload: task,
      });
    }
    
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('Failed to create task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
