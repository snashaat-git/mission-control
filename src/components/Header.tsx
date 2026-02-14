'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Settings, Library, AlertTriangle, X, Mic } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { PromptsLibrary } from './PromptsLibrary';
import { VoiceInterface } from './VoiceInterface';
import { format } from 'date-fns';
import type { Task, TaskStatus } from '@/lib/types';

// Stuck thresholds (matches MissionQueue)
const STUCK_THRESHOLDS: Record<TaskStatus, number> = {
  'inbox': 60,
  'assigned': 30,
  'in_progress': 120,
  'testing': 1440,
  'review': 480,
  'done': Infinity,
  'failed': Infinity,
};

interface Bottleneck {
  type: 'stuck' | 'queue';
  message: string;
  count: number;
  severity: 'low' | 'medium' | 'high';
}

function analyzeBottlenecks(tasks: Task[]): Bottleneck[] {
  const bottlenecks: Bottleneck[] = [];
  
  // Count stuck tasks by status
  const now = Date.now();
  const stuckByStatus: Record<string, number> = {};
  
  tasks.forEach((task) => {
    if (task.status === 'done') return;
    
    const updatedAt = new Date(task.updated_at).getTime();
    const minutesInStatus = Math.floor((now - updatedAt) / 60000);
    const threshold = STUCK_THRESHOLDS[task.status] ?? Infinity;
    
    if (minutesInStatus > threshold) {
      stuckByStatus[task.status] = (stuckByStatus[task.status] || 0) + 1;
    }
  });
  
  // Create bottleneck alerts for significant stuck counts
  if (stuckByStatus['in_progress'] >= 2) {
    bottlenecks.push({
      type: 'stuck',
      message: `${stuckByStatus['in_progress']} tasks stuck in progress`,
      count: stuckByStatus['in_progress'],
      severity: 'high',
    });
  }
  
  if (stuckByStatus['testing'] >= 3) {
    bottlenecks.push({
      type: 'stuck',
      message: `${stuckByStatus['testing']} tasks stuck in testing`,
      count: stuckByStatus['testing'],
      severity: 'medium',
    });
  }
  
  if (stuckByStatus['assigned'] >= 3) {
    bottlenecks.push({
      type: 'stuck',
      message: `${stuckByStatus['assigned']} tasks assigned but not started`,
      count: stuckByStatus['assigned'],
      severity: 'medium',
    });
  }
  
  // Alert on too many inbox items
  const inboxCount = tasks.filter((t) => t.status === 'inbox').length;
  if (inboxCount >= 5) {
    bottlenecks.push({
      type: 'queue',
      message: `${inboxCount} tasks waiting in inbox`,
      count: inboxCount,
      severity: inboxCount >= 10 ? 'high' : 'low',
    });
  }
  
  return bottlenecks;
}

export function Header() {
  const router = useRouter();
  const { agents, tasks, isOnline, selectedBusiness, setSelectedBusiness } = useMissionControl();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeSubAgents, setActiveSubAgents] = useState(0);
  const [showPromptsLibrary, setShowPromptsLibrary] = useState(false);
  const [showVoiceInterface, setShowVoiceInterface] = useState(false);
  const [bottlenecks, setBottlenecks] = useState<Bottleneck[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load active sub-agent count
  useEffect(() => {
    const loadSubAgentCount = async () => {
      try {
        const res = await fetch('/api/openclaw/sessions?session_type=subagent&status=active');
        if (res.ok) {
          const sessions = await res.json();
          setActiveSubAgents(sessions.length);
        }
      } catch (error) {
        console.error('Failed to load sub-agent count:', error);
      }
    };

    loadSubAgentCount();

    // Poll every 10 seconds
    const interval = setInterval(loadSubAgentCount, 10000);
    return () => clearInterval(interval);
  }, []);

  // Analyze bottlenecks when tasks change
  useEffect(() => {
    const newBottlenecks = analyzeBottlenecks(tasks);
    setBottlenecks(newBottlenecks);
  }, [tasks]);

  const workingAgents = agents.filter((a) => a.status === 'working').length;
  const activeAgents = workingAgents + activeSubAgents;
  const tasksInQueue = tasks.filter((t) => t.status !== 'done' && t.status !== 'review').length;

  // Filter out dismissed bottlenecks
  const activeBottlenecks = bottlenecks.filter((b) => !dismissedAlerts.has(b.message));

  const dismissBottleneck = (message: string) => {
    setDismissedAlerts((prev) => new Set([...prev, message]));
  };

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-mc-accent-red/20 border-mc-accent-red text-mc-accent-red';
      case 'medium':
        return 'bg-mc-accent-yellow/20 border-mc-accent-yellow text-mc-accent-yellow';
      case 'low':
        return 'bg-mc-text-secondary/20 border-mc-text-secondary text-mc-text-secondary';
      default:
        return 'bg-mc-bg-tertiary border-mc-border text-mc-text-secondary';
    }
  };

  return (
    <>
      <header className="h-14 bg-mc-bg-secondary border-b border-mc-border flex items-center justify-between px-4">
        {/* Left: Logo & Title */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-mc-accent-cyan" />
            <span className="font-semibold text-mc-text uppercase tracking-wider text-sm">
              Mission Control
            </span>
          </div>

          {/* Business Selector */}
          <select
            value={selectedBusiness}
            onChange={(e) => setSelectedBusiness(e.target.value)}
            className="bg-mc-bg-tertiary border border-mc-border rounded px-3 py-1 text-sm text-mc-text focus:outline-none focus:border-mc-accent"
          >
            <option value="all">All Businesses</option>
            <option value="default">Default Workspace</option>
          </select>
        </div>

        {/* Center: Stats */}
        <div className="flex items-center gap-8">
          <div className="text-center">
            <div className="text-2xl font-bold text-mc-accent-cyan">{activeAgents}</div>
            <div className="text-xs text-mc-text-secondary uppercase">Agents Active</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-mc-accent-purple">{tasksInQueue}</div>
            <div className="text-xs text-mc-text-secondary uppercase">Tasks in Queue</div>
          </div>
        </div>

        {/* Right: Time & Status */}
        <div className="flex items-center gap-4">
          <span className="text-mc-text-secondary text-sm font-mono">
            {format(currentTime, 'HH:mm:ss')} AM
          </span>
          <div
            className={`flex items-center gap-2 px-3 py-1 rounded border text-sm font-medium ${
              isOnline
                ? 'bg-mc-accent-green/20 border-mc-accent-green text-mc-accent-green'
                : 'bg-mc-accent-red/20 border-mc-accent-red text-mc-accent-red'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-mc-accent-green animate-pulse' : 'bg-mc-accent-red'
              }`}
            />
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </div>
          <button
            onClick={() => setShowPromptsLibrary(true)}
            className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mc-accent focus-visible:ring-offset-1 focus-visible:ring-offset-mc-bg"
            title="Prompts Library"
            aria-label="Prompts Library"
          >
            <Library className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowVoiceInterface(true)}
            className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mc-accent focus-visible:ring-offset-1 focus-visible:ring-offset-mc-bg"
            title="Voice Control"
            aria-label="Voice Control"
          >
            <Mic className="w-5 h-5" />
          </button>
          <button
            onClick={() => router.push('/settings')}
            className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mc-accent focus-visible:ring-offset-1 focus-visible:ring-offset-mc-bg"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Voice Interface Modal */}
        {showVoiceInterface && (
          <VoiceInterface
            onCommand={(result) => {
              // Handle voice commands
              console.log('Voice command:', result);
              // You can add navigation or action handling here
            }}
          />
        )}

        {/* Prompts Library Modal */}
        <PromptsLibrary 
          isOpen={showPromptsLibrary} 
          onClose={() => setShowPromptsLibrary(false)} 
        />
      </header>

      {/* Bottleneck Alerts Banner */}
      {activeBottlenecks.length > 0 && (
        <div className="bg-mc-bg-secondary border-b border-mc-border px-4 py-2 space-y-2">
          {activeBottlenecks.map((bottleneck, index) => (
            <div
              key={index}
              className={`flex items-center justify-between px-3 py-2 rounded border ${getSeverityStyles(
                bottleneck.severity
              )}`}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">{bottleneck.message}</span>
              </div>
              <button
                onClick={() => dismissBottleneck(bottleneck.message)}
                className="p-1 hover:bg-black/10 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mc-accent"
                title="Dismiss"
                aria-label="Dismiss alert"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {activeBottlenecks.length > 1 && (
            <button
              onClick={() => setDismissedAlerts(new Set(bottlenecks.map((b) => b.message)))}
              className="text-xs text-mc-text-secondary hover:text-mc-text underline"
            >
              Dismiss all alerts
            </button>
          )}
        </div>
      )}
    </>
  );
}
