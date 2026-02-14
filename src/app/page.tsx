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
import { MessageSquare, PanelRightOpen, PanelRightClose, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { SearchBar } from '@/components/SearchBar';
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
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(18); // percentage
  const [liveFeedWidth, setLiveFeedWidth] = useState(20); // percentage
  const [isResizing, setIsResizing] = useState(false);

  // Connect to SSE for real-time updates
  useSSE();

  // Handle resize - auto-collapse panels on small screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setShowLiveFeed(false);
        setShowSidebar(false);
      } else {
        setShowSidebar(true);
      }
    };

    // Run once on mount
    handleResize();

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
      <div className="h-screen flex flex-col bg-mc-bg overflow-hidden">
        {/* Skeleton Header */}
        <div className="h-14 border-b border-mc-border bg-mc-bg-secondary flex items-center px-6 gap-4">
          <div className="w-32 h-5 bg-mc-bg-tertiary rounded animate-pulse" />
          <div className="flex-1" />
          <div className="w-20 h-5 bg-mc-bg-tertiary rounded animate-pulse" />
          <div className="w-20 h-5 bg-mc-bg-tertiary rounded animate-pulse" />
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Skeleton Sidebar */}
          <div className="w-[18%] min-w-[200px] bg-mc-bg-secondary border-r border-mc-border p-3 space-y-3">
            <div className="w-24 h-4 bg-mc-bg-tertiary rounded animate-pulse" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-2 p-2">
                <div className="w-8 h-8 bg-mc-bg-tertiary rounded-full animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="w-20 h-3 bg-mc-bg-tertiary rounded animate-pulse" />
                  <div className="w-14 h-2.5 bg-mc-bg-tertiary rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>

          {/* Skeleton Kanban */}
          <div className="flex-1 flex flex-col">
            <div className="h-10 border-b border-mc-border" />
            <div className="flex-1 flex gap-3 p-3">
              {[1, 2, 3, 4, 5, 6].map((col) => (
                <div key={col} className="flex-1 min-w-[140px] bg-mc-bg rounded border border-mc-border border-t-2 border-t-mc-bg-tertiary">
                  <div className="p-2 border-b border-mc-border flex justify-between">
                    <div className="w-16 h-3 bg-mc-bg-tertiary rounded animate-pulse" />
                    <div className="w-5 h-3 bg-mc-bg-tertiary rounded animate-pulse" />
                  </div>
                  <div className="p-2 space-y-2">
                    {Array.from({ length: Math.max(1, 3 - col) }).map((_, j) => (
                      <div key={j} className="bg-mc-bg-secondary border border-mc-border rounded p-3 space-y-2">
                        <div className="w-full h-3 bg-mc-bg-tertiary rounded animate-pulse" />
                        <div className="w-2/3 h-2.5 bg-mc-bg-tertiary rounded animate-pulse" />
                        <div className="flex justify-between">
                          <div className="w-12 h-2.5 bg-mc-bg-tertiary rounded animate-pulse" />
                          <div className="w-10 h-2.5 bg-mc-bg-tertiary rounded animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-mc-bg overflow-hidden">
      <Header />

      {/* CSS Grid Layout - truly responsive */}
      <div
        className="flex-1 grid overflow-hidden relative"
        style={{
          gridTemplateColumns: showSidebar
            ? (showLiveFeed
              ? `${sidebarWidth}% 1fr ${liveFeedWidth}%`
              : `${sidebarWidth}% 1fr`)
            : (showLiveFeed ? `1fr ${liveFeedWidth}%` : '1fr'),
          transition: isResizing ? 'none' : 'grid-template-columns 0.2s ease'
        }}
      >
        {/* Agents Sidebar - hidden on mobile, collapsible */}
        {showSidebar && (
          <div className="min-w-[200px] max-w-[400px] bg-mc-bg-secondary border-r border-mc-border flex flex-col overflow-hidden max-md:fixed max-md:inset-y-14 max-md:left-0 max-md:z-40 max-md:w-72 max-md:max-w-[80vw] max-md:shadow-2xl">
            <AgentsSidebar />
          </div>
        )}

        {/* Mobile sidebar overlay */}
        {showSidebar && (
          <div
            className="hidden max-md:block fixed inset-0 bg-black/30 z-30"
            onClick={() => setShowSidebar(false)}
          />
        )}

        {/* Main Content Area - fills remaining space */}
        <div id="main-content" className="flex flex-col min-w-0 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 p-2 border-b border-mc-border">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-1.5 rounded text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary transition-colors md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
            >
              {showSidebar ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>
            <SearchBar />
            <div className="flex-1" />
            <button
              onClick={() => setShowLiveFeed(!showLiveFeed)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors whitespace-nowrap min-h-[44px] md:min-h-0 ${
                showLiveFeed
                  ? 'bg-mc-accent/20 text-mc-accent'
                  : 'bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text'
              }`}
              aria-label={showLiveFeed ? 'Hide live feed' : 'Show live feed'}
            >
              {showLiveFeed ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              <span className="hidden sm:inline">Live Feed</span>
            </button>
            <button
              onClick={() => setShowChat(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-mc-accent/20 text-mc-accent rounded text-sm hover:bg-mc-accent/30 transition-colors min-h-[44px] md:min-h-0"
              aria-label="Open chat"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Chat</span>
            </button>
          </div>

          <MissionQueue />
        </div>

        {/* Live Feed - scales with browser width when shown */}
        {showLiveFeed && (
          <div className="min-w-[250px] max-w-[500px] bg-mc-bg-secondary border-l border-mc-border flex flex-col overflow-hidden max-md:hidden">
            <LiveFeed />
          </div>
        )}
      </div>

      {/* Chat Modal - Floating button + modal */}
      <ChatModal 
        isOpen={showChat} 
        onClose={() => setShowChat(false)}
        onOpen={() => setShowChat(true)}
      />
      <SSEDebugPanel />
    </div>
  );
}
