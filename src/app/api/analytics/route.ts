/**
 * Analytics API
 * Agent performance and task velocity metrics
 */

import { NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';
import type { Agent, Task, Event } from '@/lib/types';

interface AgentStats {
  agent_id: string;
  agent_name: string;
  agent_emoji: string;
  total_tasks_completed: number;
  tasks_completed_today: number;
  tasks_completed_this_week: number;
  average_time_in_progress: number; // minutes
  average_time_in_testing: number; // minutes
  success_rate: number; // % of tasks not cancelled
  current_load: number; // tasks assigned/in_progress
  velocity_score: number; // composite score 0-100
}

interface SystemStats {
  total_tasks: number;
  tasks_by_status: Record<string, number>;
  tasks_created_today: number;
  tasks_completed_today: number;
  average_completion_time: number; // hours
  botttlneck_status: 'healthy' | 'warning' | 'critical';
}

export async function GET() {
  try {
    // Get all agents with stats
    const agents = queryAll<Agent & { 
      total_tasks: number;
      completed_tasks: number;
      cancelled_tasks: number;
    }>(`
      SELECT 
        a.*,
        COUNT(DISTINCT t.id) as total_tasks,
        COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END) as completed_tasks,
        COUNT(DISTINCT CASE WHEN t.status = 'cancelled' THEN t.id END) as cancelled_tasks
      FROM agents a
      LEFT JOIN tasks t ON t.assigned_agent_id = a.id
      GROUP BY a.id
    `);

    // Get completion events for time calculations
    const completionEvents = queryAll<Event & { 
      task_created_at: string;
      time_to_complete: number;
    }>(`
      SELECT 
        e.*,
        t.created_at as task_created_at,
        (julianday(e.created_at) - julianday(t.created_at)) * 24 * 60 as time_to_complete
      FROM events e
      JOIN tasks t ON e.task_id = t.id
      WHERE e.type = 'task_completed'
      ORDER BY e.created_at DESC
    `);

    // Calculate per-agent stats
    const agentStats: AgentStats[] = agents.map((agent) => {
      const agentCompletions = completionEvents.filter(
        (e) => e.agent_id === agent.id
      );

      // Tasks completed today
      const today = new Date().toISOString().split('T')[0];
      const todayCompletions = agentCompletions.filter((e) =>
        e.created_at.startsWith(today)
      );

      // Tasks completed this week
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekCompletions = agentCompletions.filter(
        (e) => new Date(e.created_at) >= weekAgo
      );

      // Average time calculation (last 10 tasks)
      const recentCompletions = agentCompletions.slice(0, 10);
      const avgTimeMinutes =
        recentCompletions.length > 0
          ? recentCompletions.reduce((sum, e) => sum + (e.time_to_complete || 0), 0) /
            recentCompletions.length
          : 0;

      // Success rate
      const total = agent.total_tasks || 0;
      const cancelled = agent.cancelled_tasks || 0;
      const successRate = total > 0 ? ((total - cancelled) / total) * 100 : 100;

      // Current load (assigned + in_progress)
      const currentLoad = queryAll<{ count: number }>(`
        SELECT COUNT(*) as count FROM tasks 
        WHERE assigned_agent_id = ? AND status IN ('assigned', 'in_progress')
      `, [agent.id])[0]?.count || 0;

      // Velocity score (composite)
      const velocityScore = Math.min(
        100,
        Math.round(
          (successRate * 0.4) + // 40% success rate
          (Math.min(10, todayCompletions.length) * 5) + // 50% daily output (max 10)
          (Math.max(0, 100 - avgTimeMinutes / 10) * 0.1) // 10% speed bonus
        )
      );

      return {
        agent_id: agent.id,
        agent_name: agent.name,
        agent_emoji: agent.avatar_emoji || '🤖',
        total_tasks_completed: agent.completed_tasks || 0,
        tasks_completed_today: todayCompletions.length,
        tasks_completed_this_week: weekCompletions.length,
        average_time_in_progress: Math.round(avgTimeMinutes),
        average_time_in_testing: 0, // Would need more detailed tracking
        success_rate: Math.round(successRate),
        current_load: currentLoad,
        velocity_score: velocityScore,
      };
    });

    // System-wide stats
    const systemStats: SystemStats = (() => {
      const tasks = queryAll<Task>('SELECT * FROM tasks');
      const today = new Date().toISOString().split('T')[0];

      const byStatus: Record<string, number> = {};
      tasks.forEach((t) => {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      });

      const tasksCreatedToday = tasks.filter((t) =>
        t.created_at.startsWith(today)
      ).length;

      const tasksCompletedToday = completionEvents.filter((e) =>
        e.created_at.startsWith(today)
      ).length;

      const avgCompletionTime =
        completionEvents.length > 0
          ? completionEvents.reduce((sum, e) => sum + (e.time_to_complete || 0), 0) /
            completionEvents.length /
            60 // Convert to hours
          : 0;

      // Determine health status
      const stuckInProgress = byStatus['in_progress'] || 0;
      const stuckInTesting = byStatus['testing'] || 0;
      let health: SystemStats['botttlneck_status'] = 'healthy';
      if (stuckInProgress >= 2 || stuckInTesting >= 5) {
        health = 'critical';
      } else if (stuckInProgress >= 1 || stuckInTesting >= 3) {
        health = 'warning';
      }

      return {
        total_tasks: tasks.length,
        tasks_by_status: byStatus,
        tasks_created_today: tasksCreatedToday,
        tasks_completed_today: tasksCompletedToday,
        average_completion_time: Math.round(avgCompletionTime * 10) / 10,
        botttlneck_status: health,
      };
    })();

    return NextResponse.json({
      agents: agentStats,
      system: systemStats,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to generate analytics' },
      { status: 500 }
    );
  }
}
