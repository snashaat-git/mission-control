'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Clock, CheckCircle, AlertTriangle, TrendingUp, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AgentStats {
  agent_id: string;
  agent_name: string;
  agent_emoji: string;
  total_tasks_completed: number;
  tasks_completed_today: number;
  tasks_completed_this_week: number;
  average_time_in_progress: number;
  success_rate: number;
  current_load: number;
  velocity_score: number;
}

interface SystemStats {
  total_tasks: number;
  tasks_by_status: Record<string, number>;
  tasks_created_today: number;
  tasks_completed_today: number;
  average_completion_time: number;
  botttlneck_status: 'healthy' | 'warning' | 'critical';
}

interface AnalyticsData {
  agents: AgentStats[];
  system: SystemStats;
  generated_at: string;
}

export function AnalyticsPanel() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        const res = await fetch('/api/analytics');
        if (res.ok) {
          const analytics = await res.json();
          setData(analytics);
        } else {
          setError('Failed to load analytics');
        }
      } catch (err) {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();
    // Refresh every 30 seconds
    const interval = setInterval(loadAnalytics, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="p-4 text-mc-text-secondary">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 animate-pulse" />
          Loading analytics...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 text-mc-accent-red">
        <AlertTriangle className="w-5 h-5" />
        {error || 'Failed to load analytics'}
      </div>
    );
  }

  const { agents, system } = data;

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-mc-accent-green';
      case 'warning': return 'text-mc-accent-yellow';
      case 'critical': return 'text-mc-accent-red';
      default: return 'text-mc-text-secondary';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-mc-accent-green';
    if (score >= 60) return 'text-mc-accent-yellow';
    return 'text-mc-accent-red';
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes / 1440)}d`;
  };

  return (
    <div className="p-4 space-y-6">
      {/* System Overview */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={<CheckCircle className="w-5 h-5 text-mc-accent-green" />}
          label="Tasks Today"
          value={system.tasks_completed_today}
          subtext={`${system.tasks_created_today} created`}
        />
        <StatCard
          icon={<Clock className="w-5 h-5 text-mc-accent-cyan" />}
          label="Avg Completion"
          value={`${system.average_completion_time}h`}
          subtext="Last 10 tasks"
        />
        <StatCard
          icon={<Users className="w-5 h-5 text-mc-accent-purple" />}
          label="Total Tasks"
          value={system.total_tasks}
          subtext={`${agents.length} agents`}
        />
        <StatCard
          icon={<TrendingUp className={`w-5 h-5 ${getHealthColor(system.botttlneck_status)}`} />}
          label="System Health"
          value={system.botttlneck_status.toUpperCase()}
          subtext="Auto-calculated"
          valueClass={getHealthColor(system.botttlneck_status)}
        />
      </div>

      {/* Status Distribution */}
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Tasks by Status
        </h3>
        <div className="flex gap-2">
          {Object.entries(system.tasks_by_status).map(([status, count]) => (
            <div
              key={status}
              className="flex-1 bg-mc-bg-tertiary rounded p-2 text-center"
            >
              <div className="text-lg font-bold">{count}</div>
              <div className="text-xs text-mc-text-secondary uppercase">
                {status.replace('_', ' ')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Leaderboard */}
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Agent Performance
        </h3>
        <div className="space-y-2">
          {agents
            .sort((a, b) => b.velocity_score - a.velocity_score)
            .map((agent) => (
              <div
                key={agent.agent_id}
                className="flex items-center gap-4 p-3 bg-mc-bg rounded hover:bg-mc-bg-tertiary/50 transition-colors"
              >
                <span className="text-2xl">{agent.agent_emoji}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{agent.agent_name}</span>
                    <span className={`font-bold ${getScoreColor(agent.velocity_score)}`}>
                      {agent.velocity_score}/100
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-mc-text-secondary mt-1">
                    <span>✓ {agent.total_tasks_completed} total</span>
                    <span>📅 {agent.tasks_completed_today} today</span>
                    <span>📊 {agent.success_rate}% success</span>
                    <span>⏱️ {formatDuration(agent.average_time_in_progress)} avg</span>
                    <span className={agent.current_load > 2 ? 'text-mc-accent-red' : ''}>
                      📝 {agent.current_load} active
                    </span>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="text-xs text-mc-text-secondary text-right">
        Last updated: {formatDistanceToNow(new Date(data.generated_at), { addSuffix: true })}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtext,
  valueClass = '',
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-mc-text-secondary uppercase">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
      <div className="text-xs text-mc-text-secondary">{subtext}</div>
    </div>
  );
}
