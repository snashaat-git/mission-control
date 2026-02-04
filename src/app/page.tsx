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
  const [showLiveFeed, setShowLiveFeed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(18); // percentage
  const [liveFeedWidth, setLiveFeedWidth] = useState(20); // percentage
  const [isResizing, setIsResizing] = useState(false);

  // Connect to SSE for real-time updates
  useSSE();

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      // On small screens, auto-collapse panels
      if (window.innerWidth < 768) {
        setShowLiveFeed(false);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initial data load
  useEffect(() => {
    async function loadData() {
      try {
        debug.api('Loading initial data...');
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

    async function checkOpenClaw() {
      try {
        const res = await fetch('/api/openclaw/status');
        if (res.ok) {
          const status = await res.json();
          setIsOnline(status.connected);
        }
      } catch {
        setIsOnline(false);
      }
    }

    loadData();
    checkOpenClaw();

    const eventPoll = setInterval(async () => {
      try {
        const res = await fetch('/api/events?limit=20');
        if (res.ok) setEvents(await res.json());
      } catch (error) {
        console.error('Failed to poll events:', error);
      }
    }, 5000);

    const taskPoll = setInterval(async () => {
      try {
        const res = await fetch('/api/tasks');
        if (res.ok) {
          const newTasks: Task[] = await res.json();
          const currentTasks = useMissionControl.getState().tasks;
          const hasChanges = newTasks.length !== currentTasks.length ||
            newTasks.some((t) => {
              const current = currentTasks.find(ct => ct.id === t.id);
              return !current || current.status !== t.status;
            });
          if (hasChanges) setTasks(newTasks);
        }
      } catch (error) {
        console.error('Failed to poll tasks:', error);
      }
    }, 10000);

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

      {/* CSS Grid Layout - truly responsive */}
      <div 
        className="flex-1 grid overflow-hidden"
        style={{
          gridTemplateColumns: showLiveFeed 
            ? `${sidebarWidth}% 1fr ${liveFeedWidth}%`
            : `${sidebarWidth}% 1fr`,
          transition: isResizing ? 'none' : 'grid-template-columns 0.2s ease'
        }}
      >
        {/* Agents Sidebar - scales with browser width */}
        <div className="min-w-[200px] max-w-[400px] bg-mc-bg-secondary border-r border-mc-border flex flex-col overflow-hidden">
          <AgentsSidebar />
        </div>

        {/* Main Content Area - fills remaining space */}
        <div className="flex flex-col min-w-0 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-end gap-2 p-2 border-b border-mc-border">
            <button
              onClick={() => setShowLiveFeed(!showLiveFeed)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors whitespace-nowrap ${
                showLiveFeed 
                  ? 'bg-mc-accent/20 text-mc-accent' 
                  : 'bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text'
              }`}
            >
              {showLiveFeed ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              <span className="hidden sm:inline">Live Feed</span>
            </button>
            <button
              onClick={() => setShowChat(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-mc-accent/20 text-mc-accent rounded text-sm hover:bg-mc-accent/30 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Chat</span>
            </button>
          </div>

          <MissionQueue />
        </div>

        {/* Live Feed - scales with browser width when shown */}
        {showLiveFeed && (
          <div className="min-w-[250px] max-w-[500px] bg-mc-bg-secondary border-l border-mc-border flex flex-col overflow-hidden">
            <LiveFeed />
          </div>
        )}
      </div>

      {/* Chat Modal */}
      <ChatModal isOpen={showChat} onClose={() => setShowChat(false)} />
      <SSEDebugPanel />
    </div>
  );
}
