/**
 * Next Action Prediction API
 * Suggests optimal next actions based on task state and history
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/db';
import type { Task, TaskActivity, Event } from '@/lib/types';

interface NextAction {
  action: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  suggested_assignee?: string;
  estimated_time?: number; // minutes
}

interface TaskInsights {
  task: Task;
  insights: {
    stuck_reason?: string;
    complexity_estimate: 'low' | 'medium' | 'high';
    similar_tasks_completed: number;
    avg_time_for_similar: number;
    next_actions: NextAction[];
  };
}

function estimateComplexity(task: Task): 'low' | 'medium' | 'high' {
  const text = `${task.title} ${task.description || ''}`.toLowerCase();
  
  // High complexity indicators
  if (text.includes('integration') || 
      text.includes('architecture') || 
      text.includes('refactor') ||
      text.includes('migration') ||
      (task.description?.length || 0) > 1000) {
    return 'high';
  }
  
  // Medium complexity
  if (text.includes('feature') || 
      text.includes('api') || 
      text.includes('database') ||
      (task.description?.length || 0) > 500) {
    return 'medium';
  }
  
  return 'low';
}

function findSimilarTasks(task: Task): Task[] {
  const keywords = task.title
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 0);
  
  if (keywords.length === 0) return [];
  
  const pattern = keywords.join('%') + '%';
  
  return queryAll<Task>(
    `SELECT * FROM tasks 
     WHERE id != ? 
       AND status = 'done'
       AND (title LIKE ? OR description LIKE ?)
     ORDER BY updated_at DESC
     LIMIT 5`,
    [task.id, pattern, pattern]
  );
}

function generateNextActions(task: Task, activities: TaskActivity[]): NextAction[] {
  const actions: NextAction[] = [];
  
  switch (task.status) {
    case 'inbox':
      actions.push({
        action: 'assign_to_agent',
        reason: 'Task needs to be assigned to start work',
        priority: 'high',
        suggested_assignee: 'Based on specialization matching',
        estimated_time: 1,
      });
      break;
      
    case 'assigned':
      const timeInAssigned = Math.floor(
        (Date.now() - new Date(task.updated_at).getTime()) / 60000
      );
      if (timeInAssigned > 30) {
        actions.push({
          action: 'check_agent_status',
          reason: `Task has been assigned for ${timeInAssigned}m without progress`,
          priority: 'medium',
          estimated_time: 5,
        });
      }
      break;
      
    case 'in_progress':
      const timeInProgress = Math.floor(
        (Date.now() - new Date(task.updated_at).getTime()) / 60000
      );
      
      if (timeInProgress > 120) {
        actions.push({
          action: 'request_status_update',
          reason: 'Task in progress for 2+ hours - check for blockers',
          priority: 'high',
          estimated_time: 10,
        });
      }
      
      // Check for recent activity
      const recentActivity = activities.filter(
        (a) => new Date(a.created_at) > new Date(Date.now() - 30 * 60000)
      );
      
      if (recentActivity.length === 0 && timeInProgress > 60) {
        actions.push({
          action: 'ping_agent',
          reason: 'No activity in the last 30 minutes',
          priority: 'medium',
          estimated_time: 2,
        });
      }
      break;
      
    case 'testing':
      actions.push({
        action: 'run_tests',
        reason: 'Execute test suite and verify deliverables',
        priority: 'high',
        estimated_time: 15,
      });
      
      const testDuration = Math.floor(
        (Date.now() - new Date(task.updated_at).getTime()) / 60000
      );
      
      if (testDuration > 1440) {
        actions.push({
          action: 'auto_review',
          reason: 'Testing phase exceeded 24h - likely ready for review',
          priority: 'medium',
          estimated_time: 5,
        });
      }
      break;
      
    case 'review':
      actions.push({
        action: 'review_deliverables',
        reason: 'Check output quality and completeness',
        priority: 'high',
        estimated_time: 20,
      });
      break;
      
    case 'done':
      actions.push({
        action: 'archive_outputs',
        reason: 'Organize and backup task deliverables',
        priority: 'low',
        estimated_time: 5,
      });
      break;
  }
  
  // Generic actions based on task age
  const taskAge = Math.floor(
    (Date.now() - new Date(task.created_at).getTime()) / 60000
  );
  
  if (taskAge > 2880 && task.status !== 'done') { // 48 hours
    actions.push({
      action: 'escalate_priority',
      reason: 'Task is 2+ days old - consider escalating or breaking down',
      priority: 'high',
      estimated_time: 10,
    });
  }
  
  return actions;
}

/**
 * GET /api/tasks/next-action?task_id=xxx
 * Get AI-powered suggestions for next actions on a task
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('task_id');
    
    if (!taskId) {
      return NextResponse.json(
        { error: 'task_id parameter required' },
        { status: 400 }
      );
    }
    
    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    
    // Get activities
    const activities = queryAll<TaskActivity>(
      'SELECT * FROM task_activities WHERE task_id = ? ORDER BY created_at DESC',
      [taskId]
    );
    
    // Get events
    const events = queryAll<Event>(
      'SELECT * FROM events WHERE task_id = ? ORDER BY created_at DESC LIMIT 20',
      [taskId]
    );
    
    // Analyze
    const complexity = estimateComplexity(task);
    const similarTasks = findSimilarTasks(task);
    
    const avgTimeForSimilar =
      similarTasks.length > 0
        ? similarTasks.reduce((sum, t) => {
            const created = new Date(t.created_at).getTime();
            const completed = new Date(t.updated_at).getTime();
            return sum + (completed - created) / 60000;
          }, 0) / similarTasks.length
        : 0;
    
    const nextActions = generateNextActions(task, activities);
    
    // Determine stuck reason if applicable
    let stuckReason: string | undefined;
    const timeInStatus = Math.floor(
      (Date.now() - new Date(task.updated_at).getTime()) / 60000
    );
    
    if (task.status === 'in_progress' && timeInStatus > 120) {
      // Check for error events
      const errors = events.filter((e) => 
        e.type.includes('error') || e.message?.toLowerCase().includes('fail')
      );
      
      if (errors.length > 0) {
        stuckReason = `Recent errors detected: ${errors[0].message?.substring(0, 50)}...`;
      } else if (activities.length === 0) {
        stuckReason = 'No activity logged since assignment';
      } else {
        stuckReason = 'May be waiting for dependencies or clarification';
      }
    }
    
    const insights: TaskInsights = {
      task,
      insights: {
        stuck_reason: stuckReason,
        complexity_estimate: complexity,
        similar_tasks_completed: similarTasks.length,
        avg_time_for_similar: Math.round(avgTimeForSimilar),
        next_actions: nextActions,
      },
    };
    
    return NextResponse.json(insights);
  } catch (error) {
    console.error('Next action prediction error:', error);
    return NextResponse.json(
      { error: 'Failed to generate insights' },
      { status: 500 }
    );
  }
}
