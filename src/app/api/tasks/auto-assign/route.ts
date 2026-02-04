/**
 * Auto-Assign API
 * Intelligently assigns tasks to agents based on load and capacity
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Agent, Task } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

interface AgentCapacity {
  agent: Agent;
  current_load: number; // tasks assigned + in_progress
  completed_today: number;
  completed_this_week: number;
  avg_completion_time: number; // minutes
  velocity_score: number; // 0-100
  specialization_match: number; // 0-100 based on task type
  suitability_score?: number; // Calculated in selectBestAgent
}

/**
 * Calculate agent capacity and suitability score
 */
function calculateAgentCapacities(
  agents: Agent[],
  tasks: Task[],
  taskType?: string
): AgentCapacity[] {
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  return agents
    .filter((a) => a.status !== 'offline')
    .map((agent) => {
      // Current load
      const currentLoad = tasks.filter(
        (t) =>
          t.assigned_agent_id === agent.id &&
          (t.status === 'assigned' || t.status === 'in_progress')
      ).length;

      // Completed today
      const completedToday = tasks.filter(
        (t) =>
          t.assigned_agent_id === agent.id &&
          t.status === 'done' &&
          t.updated_at.startsWith(today)
      ).length;

      // Completed this week
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const completedThisWeek = tasks.filter(
        (t) =>
          t.assigned_agent_id === agent.id &&
          t.status === 'done' &&
          new Date(t.updated_at) >= weekAgo
      ).length;

      // Average completion time (last 5 tasks)
      const recentCompleted = tasks
        .filter(
          (t) =>
            t.assigned_agent_id === agent.id &&
            t.status === 'done'
        )
        .slice(0, 5);

      const avgTime =
        recentCompleted.length > 0
          ? recentCompleted.reduce((sum, t) => {
              const created = new Date(t.created_at).getTime();
              const completed = new Date(t.updated_at).getTime();
              return sum + (completed - created) / 60000; // minutes
            }, 0) / recentCompleted.length
          : 120; // Default 2 hours if no data

      // Specialization match based on role and task type
      let specializationMatch = 50; // Base score
      if (agent.role) {
        // Match based on role keywords
        const roleMatches: Record<string, string[]> = {
          Developer: ['code', 'landing', 'page', 'api', 'bug', 'fix', 'integration'],
          Researcher: ['research', 'data', 'analysis', 'search', 'find'],
          Writer: ['documentation', 'content', 'writing', 'doc'],
        };
        if (taskType && roleMatches[agent.role]) {
          if (roleMatches[agent.role].some((r) => taskType.toLowerCase().includes(r))) {
            specializationMatch = 90;
          }
        }
        
        // Additional match for Researcher on data/research tasks
        if (agent.role === 'Researcher' && taskType &&
            (taskType.includes('research') || taskType.includes('find') || taskType.includes('data'))) {
          specializationMatch = 100;
        }
      }

      // Velocity score (composite)
      const velocityScore = Math.min(
        100,
        Math.round(
          (100 - currentLoad * 15) + // Penalty for high load
          completedToday * 10 + // Bonus for productivity
          (avgTime < 60 ? 20 : avgTime < 120 ? 10 : 0) // Speed bonus
        )
      );

      return {
        agent,
        current_load: currentLoad,
        completed_today: completedToday,
        completed_this_week: completedThisWeek,
        avg_completion_time: Math.round(avgTime),
        velocity_score: velocityScore,
        specialization_match: specializationMatch,
      };
    });
}

/**
 * Select best agent for a task
 */
function selectBestAgent(
  capacities: AgentCapacity[],
  taskPriority: string
): AgentCapacity | null {
  if (capacities.length === 0) return null;

  // Score each agent
  const scored = capacities.map((cap) => {
    let score = cap.velocity_score;

    // Penalize high load
    score -= cap.current_load * 20;

    // Bonus for specialization
    score += cap.specialization_match * 0.3;

    // Urgent tasks go to fastest agents
    if (taskPriority === 'urgent' && cap.avg_completion_time < 60) {
      score += 15;
    }

    return { ...cap, suitability_score: score };
  });

  // Sort by suitability score
  scored.sort((a, b) => b.suitability_score - a.suitability_score);

  return scored[0];
}

/**
 * POST /api/tasks/auto-assign
 * Auto-assign a task to the best available agent
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { task_id, strategy = 'smart' } = body;

    // Get task details
    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [task_id]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (task.assigned_agent_id && task.status !== 'inbox') {
      return NextResponse.json(
        { error: 'Task already assigned', assigned_to: task.assigned_agent_id },
        { status: 409 }
      );
    }

    // Get all available agents and tasks
    const agents = queryAll<Agent>("SELECT * FROM agents WHERE status != 'offline'");
    const tasks = queryAll<Task>('SELECT * FROM tasks');

    // Infer task type from title/description
    const taskText = `${task.title} ${task.description || ''}`.toLowerCase();
    let taskType = 'general';
    if (taskText.includes('research') || taskText.includes('find')) taskType = 'research';
    else if (taskText.includes('landing') || taskText.includes('page')) taskType = 'landing page';
    else if (taskText.includes('bug') || taskText.includes('fix')) taskType = 'bug';
    else if (taskText.includes('api') || taskText.includes('integration')) taskType = 'api';
    else if (taskText.includes('documentation') || taskText.includes('doc')) taskType = 'documentation';
    else if (taskText.includes('data') || taskText.includes('analysis')) taskType = 'data';

    // Calculate capacities
    const capacities = calculateAgentCapacities(agents, tasks, taskType);

    // Select best agent
    const bestMatch = selectBestAgent(capacities, task.priority);

    if (!bestMatch) {
      return NextResponse.json(
        { error: 'No available agents found' },
        { status: 503 }
      );
    }

    // Assign the task
    const now = new Date().toISOString();
    run(
      'UPDATE tasks SET assigned_agent_id = ?, status = ?, updated_at = ? WHERE id = ?',
      [bestMatch.agent.id, 'assigned', now, task_id]
    );

    // Log event
    const suitabilityScore = bestMatch.suitability_score || 0;
    run(
      `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        'task_assigned',
        bestMatch.agent.id,
        task_id,
        `Auto-assigned to ${bestMatch.agent.name} (${taskType}, score: ${Math.round(suitabilityScore)})`,
        now,
      ]
    );

    // Update agent status
    run(
      'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
      ['working', now, bestMatch.agent.id]
    );

    // Broadcast update
    const updatedTask = queryOne<Task>(
      `SELECT t.*, a.name as assigned_agent_name, a.avatar_emoji as assigned_agent_emoji
       FROM tasks t
       LEFT JOIN agents a ON t.assigned_agent_id = a.id
       WHERE t.id = ?`,
      [task_id]
    );

    if (updatedTask) {
      broadcast({ type: 'task_updated', payload: updatedTask });
    }

    return NextResponse.json({
      success: true,
      task_id,
      assigned_to: {
        id: bestMatch.agent.id,
        name: bestMatch.agent.name,
        emoji: bestMatch.agent.avatar_emoji,
      },
      reason: {
        strategy,
        task_type: taskType,
        suitability_score: Math.round(bestMatch.suitability_score || 0),
        factors: {
          velocity_score: bestMatch.velocity_score,
          current_load: bestMatch.current_load,
          specialization_match: bestMatch.specialization_match,
          avg_completion_time: bestMatch.avg_completion_time,
        },
      },
    });
  } catch (error) {
    console.error('Auto-assign error:', error);
    return NextResponse.json(
      { error: 'Failed to auto-assign task' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tasks/auto-assign
 * Preview auto-assign recommendations without assigning
 */
export async function GET() {
  try {
    const agents = queryAll<Agent>("SELECT * FROM agents WHERE status != 'offline'");
    const tasks = queryAll<Task>('SELECT * FROM tasks');

    // Get unassigned inbox tasks
    const inboxTasks = tasks.filter((t) => t.status === 'inbox');

    const recommendations = inboxTasks.map((task) => {
      const taskText = `${task.title} ${task.description || ''}`.toLowerCase();
      let taskType = 'general';
      if (taskText.includes('research')) taskType = 'research';
      else if (taskText.includes('landing')) taskType = 'landing page';
      else if (taskText.includes('bug')) taskType = 'bug';
      else if (taskText.includes('api')) taskType = 'api';

      const capacities = calculateAgentCapacities(agents, tasks, taskType);
      const bestMatch = selectBestAgent(capacities, task.priority);

      return {
        task_id: task.id,
        task_title: task.title,
        recommended_agent: bestMatch
          ? {
              id: bestMatch.agent.id,
              name: bestMatch.agent.name,
              score: Math.round(bestMatch.suitability_score || 0),
            }
          : null,
      };
    });

    return NextResponse.json({
      unassigned_count: inboxTasks.length,
      recommendations,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Auto-assign preview error:', error);
    return NextResponse.json(
      { error: 'Failed to generate recommendations' },
      { status: 500 }
    );
  }
}
