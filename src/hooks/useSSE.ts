/**
 * useSSE Hook
 * Establishes and maintains Server-Sent Events connection for real-time updates
 */

'use client';

import { useEffect, useRef } from 'react';
import { useMissionControl } from '@/lib/store';
import { debug } from '@/lib/debug';
import { useNotifications } from './useNotifications';
import type { SSEEvent, Task } from '@/lib/types';

export function useSSE() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const {
    updateTask,
    addTask,
    setIsOnline,
    selectedTask,
    setSelectedTask,
  } = useMissionControl();
  const { notify } = useNotifications();

  useEffect(() => {
    let isConnecting = false;

    const connect = () => {
      if (isConnecting || eventSourceRef.current?.readyState === EventSource.OPEN) {
        return;
      }

      isConnecting = true;
      debug.sse('Connecting to event stream...');

      const eventSource = new EventSource('/api/events/stream');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        debug.sse('Connected');
        setIsOnline(true);
        isConnecting = false;
        // Clear any pending reconnect
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      };

      eventSource.onmessage = (event) => {
        try {
          // Skip keep-alive messages (they start with ":")
          if (event.data.startsWith(':')) {
            return;
          }

          const sseEvent: SSEEvent = JSON.parse(event.data);
          debug.sse(`Received event: ${sseEvent.type}`, sseEvent.payload);

          switch (sseEvent.type) {
            case 'task_created':
              debug.sse('Adding new task to store', { id: (sseEvent.payload as Task).id });
              addTask(sseEvent.payload as Task);
              break;

            case 'task_updated':
              const incomingTask = sseEvent.payload as Task;
              debug.sse('Task update received', {
                id: incomingTask.id,
                status: incomingTask.status,
                title: incomingTask.title
              });
              updateTask(incomingTask);

              // Update selected task if viewing this task (for modal)
              if (selectedTask?.id === incomingTask.id) {
                debug.sse('Also updating selectedTask for modal');
                setSelectedTask(incomingTask);
              }

              // Browser notifications for key status changes
              if (incomingTask.status === 'done') {
                notify('Task Completed', { body: incomingTask.title, tag: `task-done-${incomingTask.id}` });
              } else if (incomingTask.status === 'review') {
                notify('Task Ready for Review', { body: incomingTask.title, tag: `task-review-${incomingTask.id}` });
              }
              break;

            case 'activity_logged':
              debug.sse('Activity logged', sseEvent.payload);
              // Activities are fetched when task detail is opened
              break;

            case 'deliverable_added':
              debug.sse('Deliverable added', sseEvent.payload);
              // Deliverables are fetched when task detail is opened
              break;

            case 'agent_spawned':
              debug.sse('Agent spawned', sseEvent.payload);
              // Will trigger re-fetch of sub-agent count
              break;

            case 'task_failed':
              const failedTask = sseEvent.payload as Task;
              debug.sse('Task failed', { id: failedTask.id, title: failedTask.title });
              updateTask(failedTask);
              if (selectedTask?.id === failedTask.id) {
                setSelectedTask(failedTask);
              }
              notify('Task Failed', { body: failedTask.title, tag: `task-failed-${failedTask.id}` });
              break;

            case 'agent_completed':
              debug.sse('Agent completed', sseEvent.payload);
              {
                const agentPayload = sseEvent.payload as { taskId?: string; sessionId?: string; agentName?: string };
                if (agentPayload.agentName) {
                  notify('Agent Finished', { body: agentPayload.agentName, tag: `agent-done-${agentPayload.sessionId}` });
                }
              }
              break;

            case 'dependency_changed':
              debug.sse('Dependency changed', sseEvent.payload);
              // Re-fetch tasks to get updated dependency counts and blocked status
              fetch('/api/tasks')
                .then(res => res.ok ? res.json() : [])
                .then(tasks => {
                  if (Array.isArray(tasks)) {
                    tasks.forEach((t: Task) => updateTask(t));
                  }
                })
                .catch(() => {});
              break;

            case 'call_started':
              debug.sse('Call started', sseEvent.payload);
              notify('Call Started', { body: 'Outbound call initiated', tag: 'call-started' });
              break;

            case 'call_ended':
              debug.sse('Call ended', sseEvent.payload);
              notify('Call Ended', { body: 'Voice call completed', tag: 'call-ended' });
              break;

            case 'call_failed':
              debug.sse('Call failed', sseEvent.payload);
              notify('Call Failed', { body: 'Voice call failed', tag: 'call-failed' });
              break;

            default:
              debug.sse('Unknown event type', sseEvent);
          }
        } catch (error) {
          console.error('[SSE] Error parsing event:', error);
        }
      };

      eventSource.onerror = (error) => {
        debug.sse('Connection error', error);
        setIsOnline(false);
        isConnecting = false;

        // Close the connection
        eventSource.close();
        eventSourceRef.current = null;

        // Attempt reconnection after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          debug.sse('Attempting to reconnect...');
          connect();
        }, 5000);
      };
    };

    // Initial connection
    connect();

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        debug.sse('Disconnecting...');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [addTask, updateTask, setIsOnline, selectedTask, setSelectedTask, notify]);
}
