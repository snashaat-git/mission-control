// Task dispatcher for Antigravity Bridge agent
// Automatically dispatches tasks to Antigravity when assigned to Gravity Bridge agent

import { queryOne, run } from '@/lib/db';
import type { Task } from '@/lib/types';

const GRAVITY_BRIDGE_AGENT_NAME = 'Gravity Bridge';

/**
 * Check if a task was assigned to Gravity Bridge and auto-dispatch to Antigravity
 * This should be called when tasks are assigned or updated
 */
export async function autoDispatchToAntigravity(taskId: string): Promise<{ dispatched: boolean; message: string }> {
  try {
    // Get task with agent info
    const task = queryOne<Task & { agent_name?: string; agent_role?: string }>(
      `SELECT t.*, a.name as agent_name, a.role as agent_role
       FROM tasks t
       LEFT JOIN agents a ON t.assigned_agent_id = a.id
       WHERE t.id = ?`,
      [taskId]
    );

    if (!task) {
      return { dispatched: false, message: 'Task not found' };
    }

    // Check if assigned to Gravity Bridge
    const isGravityBridge = 
      task.agent_name === GRAVITY_BRIDGE_AGENT_NAME ||
      task.agent_role?.toLowerCase().includes('antigravity') ||
      task.agent_role?.toLowerCase().includes('gravity');

    if (!isGravityBridge) {
      return { dispatched: false, message: 'Not assigned to Gravity Bridge' };
    }

    // Check if already dispatched
    const existing = queryOne(
      'SELECT id FROM antigravity_tasks WHERE task_id = ?',
      [taskId]
    );

    if (existing) {
      return { dispatched: false, message: 'Already dispatched to Antigravity' };
    }

    // Auto-dispatch to Antigravity
    const dispatchRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/agents/antigravity/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: taskId,
        prompt: task.description || `Task: ${task.title}`,
        workspace_name: `mc-task-${taskId.slice(0, 8)}`,
        expected_artifacts: ['screenshot', 'recording', 'code'],
        output_dir: task.output_dir,
      }),
    });

    if (!dispatchRes.ok) {
      const error = await dispatchRes.json();
      return { dispatched: false, message: error.error || 'Dispatch failed' };
    }

    // Update task status to indicate it's with Antigravity
    run(
      `UPDATE tasks SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?`,
      [taskId]
    );

    // Log the activity
    const activityId = crypto.randomUUID();
    run(
      `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [activityId, taskId, 'updated', 'Auto-dispatched to Google Antigravity for artifact generation']
    );

    return { dispatched: true, message: 'Successfully dispatched to Antigravity' };

  } catch (error) {
    console.error('[Antigravity Auto-Dispatch] Error:', error);
    return { dispatched: false, message: (error as Error).message };
  }
}

/**
 * Hook to be called after task assignment
 * Add this to the task assignment/update flow
 */
export async function onTaskAssignedToAgent(taskId: string, agentId: string): Promise<void> {
  // Check if this is Gravity Bridge agent
  const agent = queryOne<{ name: string; role: string }>(
    'SELECT name, role FROM agents WHERE id = ?',
    [agentId]
  );

  if (agent && (
    agent.name === GRAVITY_BRIDGE_AGENT_NAME ||
    agent.role?.toLowerCase().includes('antigravity') ||
    agent.role?.toLowerCase().includes('gravity')
  )) {
    console.log(`[Antigravity] Task ${taskId} assigned to ${agent.name}, auto-dispatching...`);
    const result = await autoDispatchToAntigravity(taskId);
    console.log(`[Antigravity] Dispatch result:`, result);
  }
}
