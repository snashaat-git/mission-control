'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { AgentsSidebar } from '@/components/AgentsSidebar';
import { MissionQueue } from '@/components/MissionQueue';
import { LiveFeed } from '@/components/LiveFeed';
import { ChatModal } from '@/components/ChatModal';
import { SSEDebugPanel } from '@/components/SSEDebugPanel';
import { useMissionControl } from '@/lib/store';
import { useSSE } from '@/hooks/useSSE';
import { debug } from '@/lib/debug';
import { MessageSquare, PanelRightOpen, PanelRightClose } from 'lucide-react';
import type { Task } from '@/lib/types';

export default function MissionControlPage() {
  const {
    setAgents,
    setTasks,
    setConversations,
    setEvents,
    setIsOnline,
    setIsLoading,
    isLoading,
    tasks,
  } = useMissionControl();

  const [showChat, setShowChat] = useState(false);
  const [showLiveFeed, setShowLiveFeed] = useState(false); // Collapsed by default

  // Connect to SSE for real-time updates
  useSSE();

  // Initial data load
  useEffect(() => {
    async function loadData() {
      try {
        debug.api('Loading initial data...');
        // Fetch all data in parallel
        const [agentsRes, tasksRes, conversationsRes, eventsRes] = await Promise.all([
          fetch('/api/agents'),
          fetch('/api/tasks'),
          fetch('/api/conversations'),
          fetch('/api/events'),
        ]);

        if (agentsRes.ok) setAgents(await agentsRes.json());
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          debug.api('Loaded tasks', { count: tasksData.length });
          setTasks(tasksData);
        }
        if (conversationsRes.ok) setConversations(await conversationsRes.json());
        if (eventsRes.ok) setEvents(await eventsRes.json());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    // Check OpenClaw connection separately (non-blocking)
    async function checkOpenClaw() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const openclawRes = await fetch('/api/openclaw/status', { signal: controller.signal });
        clearTimeout(timeoutId);

        if (openclawRes.ok) {
          const status = await openclawRes.json();
          setIsOnline(status.connected);
        }
      } catch {
        setIsOnline(false);
      }
    }

    loadData();
    checkOpenClaw(); // Run in parallel, don't block page load

    // Poll for events every 5 seconds
    const eventPoll = setInterval(async () => {
      try {
        const res = await fetch('/api/events?limit=20');
        if (res.ok) {
          setEvents(await res.json());
        }
      } catch (error) {
        console.error('Failed to poll events:', error);
      }
    }, 5000);

    // Poll tasks as SSE fallback (every 10 seconds)
    const taskPoll = setInterval(async () => {
      try {
        const res = await fetch('/api/tasks');
        if (res.ok) {
          const newTasks: Task[] = await res.json();
          // Get current tasks from store
          const currentTasks = useMissionControl.getState().tasks;

          // Check if there are any changes
          const hasChanges = newTasks.length !== currentTasks.length ||
            newTasks.some((t) => {
              const current = currentTasks.find(ct => ct.id === t.id);
              return !current || current.status !== t.status;
            });

          if (hasChanges) {
            debug.api('[FALLBACK] Task changes detected, updating store', {
              oldCount: currentTasks.length,
              newCount: newTasks.length
            });
            setTasks(newTasks);
          }
        }
      } catch (error) {
        console.error('Failed to poll tasks:', error);
      }
    }, 10000);

    // Check OpenClaw connection every 30 seconds
    const connectionCheck = setInterval(async () => {
      try {
        const res = await fetch('/api/openclaw/status');
        if (res.ok) {
          const status = await res.json();
          setIsOnline(status.connected);
        }
      } catch {
        setIsOnline(false);
      }
    }, 30000);

    return () => {
      clearInterval(eventPoll);
      clearInterval(connectionCheck);
      clearInterval(taskPoll);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🦞</div>
          <p className="text-mc-text-secondary">Loading Mission Control...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-mc-bg overflow-hidden">
      <Header />

      <div className="flex-1 flex overflow-hidden">
        {/* Agents Sidebar - Responsive: full width mobile, fixed width desktop */}
        <div className="w-full md:w-56 lg:w-64 flex-shrink-0">
          <AgentsSidebar />
        </div>

        {/* Main Content Area - Flexible, fills remaining space */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar with toggle buttons */}
          <div className="flex items-center justify-end gap-2 p-2 border-b border-mc-border overflow-x-auto">
            <button
              onClick={() => setShowLiveFeed(!showLiveFeed)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors whitespace-nowrap ${
                showLiveFeed 
                  ? 'bg-mc-accent/20 text-mc-accent' 
                  : 'bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text'
              }`}
              title={showLiveFeed ? 'Hide Live Feed' : 'Show Live Feed'}
            >
              {showLiveFeed ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              <span className="hidden sm:inline">Live Feed</span>
            </button>
            <button
              onClick={() => setShowChat(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-mc-accent/20 text-mc-accent rounded text-sm hover:bg-mc-accent/30 transition-colors whitespace-nowrap"
              title="Open Chat"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Chat</span>
            </button>
          </div>

          <MissionQueue />
        </div>

        {/* Live Feed - Responsive width, collapsible */}
        {showLiveFeed && (
          <div className="w-full sm:w-64 md:w-72 lg:w-80 border-l border-mc-border bg-mc-bg-secondary flex flex-col flex-shrink-0">
            <LiveFeed />
          </div>
        )}
      </div>

      {/* Chat Modal - overlay instead of inline */}
      <ChatModal isOpen={showChat} onClose={() => setShowChat(false)} />

      {/* Debug Panel - only shows when debug mode enabled */}
      <SSEDebugPanel />
    </div>
  );
}
