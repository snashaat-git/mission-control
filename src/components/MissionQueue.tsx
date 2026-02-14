'use client';

import { useState, useCallback, useMemo, memo } from 'react';
import { Plus, ChevronRight, GripVertical, CheckCircle, ArrowRight, RotateCcw, Sparkles, Brain, Zap, BarChart3, X, Lock } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { Task, TaskStatus } from '@/lib/types';
import { TaskModal } from './TaskModal';
import { TemplatePicker } from './TemplatePicker';
import { AnalyticsPanel } from './AnalyticsPanel';
import { TASK_TEMPLATES, formatTemplateDefaults, calculateDueDate, type TaskTemplate } from '@/lib/templates';
import { useToast } from '@/hooks/useToast';
import { formatDistanceToNow } from 'date-fns';

// Stuck task thresholds (in minutes)
const STUCK_THRESHOLDS: Record<TaskStatus, number> = {
  'inbox': 60,        // 1 hour
  'assigned': 30,     // 30 min (should dispatch quickly)
  'in_progress': 120, // 2 hours
  'testing': 1440,    // 24 hours
  'review': 480,      // 8 hours
  'done': Infinity,   // Never stuck
  'failed': Infinity, // Never stuck (already failed)
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-mc-text-secondary/20',
  normal: 'bg-mc-accent/20',
  high: 'bg-mc-accent-yellow/20',
  urgent: 'bg-mc-accent-red/20',
};

interface StuckInfo {
  isStuck: boolean;
  minutesInStatus: number;
  threshold: number;
}

function getStuckInfo(task: Task): StuckInfo {
  const updatedAt = new Date(task.updated_at).getTime();
  const now = Date.now();
  const minutesInStatus = Math.floor((now - updatedAt) / 60000);
  const threshold = STUCK_THRESHOLDS[task.status] ?? Infinity;

  return {
    isStuck: minutesInStatus > threshold,
    minutesInStatus,
    threshold,
  };
}

function formatStuckTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'inbox', label: 'INBOX', color: 'border-t-mc-accent-pink' },
  { id: 'assigned', label: 'ASSIGNED', color: 'border-t-mc-accent-yellow' },
  { id: 'in_progress', label: 'IN PROGRESS', color: 'border-t-mc-accent' },
  { id: 'testing', label: 'TESTING', color: 'border-t-mc-accent-cyan' },
  { id: 'review', label: 'REVIEW', color: 'border-t-mc-accent-purple' },
  { id: 'done', label: 'DONE', color: 'border-t-mc-accent-green' },
  { id: 'failed', label: 'FAILED', color: 'border-t-red-500' },
];

// Undo state type
interface UndoState {
  taskId: string;
  previousStatus: TaskStatus;
  newStatus: TaskStatus;
  taskTitle: string;
  timeoutId: NodeJS.Timeout;
}

export function MissionQueue() {
  const { tasks, updateTaskStatus, addEvent, updateTask, addTask } = useMissionControl();
  const { success, error: showError, warning } = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [countdown, setCountdown] = useState(5);

  // Memoize tasks grouped by status to avoid re-filtering on every render
  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      inbox: [], assigned: [], in_progress: [], testing: [], review: [], done: [], failed: [],
    };
    for (const task of tasks) {
      grouped[task.status]?.push(task);
    }
    return grouped;
  }, [tasks]);

  const getTasksByStatus = (status: TaskStatus) => tasksByStatus[status];

  // Clear undo state
  const clearUndo = useCallback(() => {
    if (undoState?.timeoutId) {
      clearTimeout(undoState.timeoutId);
    }
    setUndoState(null);
    setCountdown(5);
  }, [undoState]);

  // Execute undo
  const handleUndo = useCallback(async () => {
    if (!undoState) return;
    
    clearTimeout(undoState.timeoutId);
    updateTaskStatus(undoState.taskId, undoState.previousStatus);
    
    try {
      const res = await fetch(`/api/tasks/${undoState.taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: undoState.previousStatus, actor_type: 'user' }),
      });
      
      if (res.ok) {
        addEvent({
          id: crypto.randomUUID(),
          type: 'task_status_changed',
          task_id: undoState.taskId,
          message: `Task "${undoState.taskTitle}" reverted to ${undoState.previousStatus}`,
          created_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Failed to undo:', error);
    }
    
    setUndoState(null);
    setCountdown(5);
  }, [undoState, updateTaskStatus, addEvent]);

  // Set up undo with countdown
  const setupUndo = useCallback((taskId: string, previousStatus: TaskStatus, newStatus: TaskStatus, taskTitle: string) => {
    if (undoState?.timeoutId) {
      clearTimeout(undoState.timeoutId);
    }
    
    let seconds = 5;
    setCountdown(seconds);
    
    const intervalId = setInterval(() => {
      seconds -= 1;
      setCountdown(seconds);
    }, 1000);
    
    const timeoutId = setTimeout(() => {
      setUndoState(null);
      setCountdown(5);
      clearInterval(intervalId);
    }, 5000);
    
    setUndoState({ taskId, previousStatus, newStatus, taskTitle, timeoutId });
  }, [undoState]);

  const handleDragStart = useCallback((e: React.DragEvent, task: Task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedTask(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = async (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    if (!draggedTask || draggedTask.status === targetStatus) {
      setDraggedTask(null);
      return;
    }

    const previousStatus = draggedTask.status;
    const taskTitle = draggedTask.title;

    // Warn if task is blocked by dependencies
    if (draggedTask.is_blocked && ['assigned', 'in_progress', 'testing', 'review', 'done'].includes(targetStatus)) {
      if (!confirm(`"${taskTitle}" has incomplete dependencies and is blocked. The server will reject this move. Continue anyway?`)) {
        setDraggedTask(null);
        return;
      }
    }

    updateTaskStatus(draggedTask.id, targetStatus);

    try {
      const res = await fetch(`/api/tasks/${draggedTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus, actor_type: 'user' }),
      });

      if (res.ok) {
        addEvent({
          id: crypto.randomUUID(),
          type: targetStatus === 'done' ? 'task_completed' : 'task_status_changed',
          task_id: draggedTask.id,
          message: `Task "${taskTitle}" moved to ${targetStatus}`,
          created_at: new Date().toISOString(),
        });
        
        if (targetStatus !== 'done') {
          setupUndo(draggedTask.id, previousStatus, targetStatus, taskTitle);
        }
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        showError(`Cannot move task: ${errorData.detail || errorData.error || 'Workflow rule violation'}`);
        updateTaskStatus(draggedTask.id, previousStatus);
      }
    } catch (error) {
      console.error('Failed to update task status:', error);
      updateTaskStatus(draggedTask.id, previousStatus);
    }

    setDraggedTask(null);
  };

  // Verify & Advance function for Testing column
  const handleVerifyAndAdvance = async (task: Task) => {
    if (!task) return;
    
    const previousStatus = task.status;
    const newStatus: TaskStatus = 'review';
    
    updateTaskStatus(task.id, newStatus);
    
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: newStatus, 
          actor_type: 'user',
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        updateTask(updated);
        
        addEvent({
          id: crypto.randomUUID(),
          type: 'task_status_changed',
          task_id: task.id,
          message: `Task "${task.title}" verified and moved to review`,
          created_at: new Date().toISOString(),
        });
        
        setupUndo(task.id, previousStatus, newStatus, task.title);
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        showError(`Cannot verify task: ${errorData.detail || errorData.error}`);
        updateTaskStatus(task.id, previousStatus);
      }
    } catch (error) {
      console.error('Failed to verify task:', error);
      updateTaskStatus(task.id, previousStatus);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="p-3 border-b border-mc-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <ChevronRight className="w-4 h-4 text-mc-text-secondary" />
          <span className="text-sm font-medium uppercase tracking-wider">Mission Queue</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Auto-Assign Button */}
          {getTasksByStatus('inbox').length > 0 && (
            <button
              onClick={async () => {
                setAutoAssigning(true);
                const inboxTasks = getTasksByStatus('inbox');
                let assigned = 0;
                
                for (const task of inboxTasks.slice(0, 3)) {
                  try {
                    const res = await fetch(`/api/tasks/auto-assign`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ task_id: task.id }),
                    });
                    if (res.ok) {
                      const result = await res.json();
                      addEvent({
                        id: crypto.randomUUID(),
                        type: 'task_assigned',
                        task_id: task.id,
                        message: `Auto-assigned "${task.title}" to ${result.assigned_to.name}`,
                        created_at: new Date().toISOString(),
                      });
                      assigned++;
                    }
                  } catch (e) {
                    console.error('Auto-assign failed:', e);
                  }
                }
                
                if (assigned > 0) {
                  success(`Auto-assigned ${assigned} task(s) to optimal agents!`);
                }
                setAutoAssigning(false);
              }}
              disabled={autoAssigning}
              className="flex items-center gap-2 px-3 py-1.5 bg-mc-accent-cyan/20 text-mc-accent-cyan border border-mc-accent-cyan rounded text-sm font-medium hover:bg-mc-accent-cyan/30 disabled:opacity-50"
            >
              <Brain className={`w-4 h-4 ${autoAssigning ? 'animate-pulse' : ''}`} />
              {autoAssigning ? 'Assigning...' : `Auto-Assign (${getTasksByStatus('inbox').length})`}
            </button>
          )}
          
          {/* Analytics Button */}
          <button
            onClick={() => setShowAnalytics(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-mc-bg-tertiary border border-mc-border rounded text-sm font-medium hover:bg-mc-bg-tertiary/80 text-mc-text-secondary"
          >
            <BarChart3 className="w-4 h-4" />
            Analytics
          </button>
          
          <button
            onClick={() => setShowTemplatePicker(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-mc-accent-pink text-mc-bg rounded text-sm font-medium hover:bg-mc-accent-pink/90"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Kanban Columns */}
      <div className="flex-1 flex gap-3 p-3 overflow-x-auto min-h-0">
        {COLUMNS.map((column) => {
          const columnTasks = getTasksByStatus(column.id);
          const isTesting = column.id === 'testing';
          
          const isDropTarget = draggedTask && draggedTask.status !== column.id;

          return (
            <div
              key={column.id}
              className={`flex-1 min-w-[140px] sm:min-w-[180px] flex flex-col bg-mc-bg rounded border border-t-2 transition-colors ${column.color} ${
                isDropTarget
                  ? 'border-mc-accent/40 shadow-[0_0_8px_rgba(88,166,255,0.15)]'
                  : 'border-mc-border'
              }`}
              style={{ maxWidth: 'calc(100% / 6)' }}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              {/* Column Header */}
              <div className="p-2 border-b border-mc-border flex items-center justify-between">
                <span className={`text-xs font-medium uppercase transition-colors ${
                  isDropTarget ? 'text-mc-accent' : 'text-mc-text-secondary'
                }`}>
                  {column.label}
                </span>
                <span className="text-xs bg-mc-bg-tertiary px-2 py-0.5 rounded text-mc-text-secondary">
                  {columnTasks.length}
                </span>
              </div>
              
              {/* Testing column: Verify & Advance buttons */}
              {isTesting && columnTasks.length > 0 && (
                <div className="p-2 border-b border-mc-border space-y-1">
                  {columnTasks.slice(0, 3).map((task) => (
                    <button
                      key={task.id}
                      onClick={() => handleVerifyAndAdvance(task)}
                      className="w-full flex items-center justify-center gap-1 px-2 py-1 bg-mc-accent-cyan/20 hover:bg-mc-accent-cyan/30 text-mc-accent-cyan text-xs rounded transition-colors"
                      title="Verify testing complete and move to review"
                    >
                      <CheckCircle className="w-3 h-3" />
                      <span className="truncate">{task.title.substring(0, 15)}{task.title.length > 15 ? '...' : ''}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  ))}
                  {columnTasks.length > 3 && (
                    <p className="text-xs text-mc-text-secondary text-center italic">
                      +{columnTasks.length - 3} more...
                    </p>
                  )}
                </div>
              )}

              {/* Tasks */}
              <div className={`flex-1 overflow-y-auto p-2 space-y-2 transition-colors ${
                draggedTask && draggedTask.status !== column.id
                  ? 'bg-mc-accent/5 border-2 border-dashed border-mc-accent/20 rounded'
                  : ''
              }`}>
                {columnTasks.length === 0 && !draggedTask && (
                  <div className="flex flex-col items-center justify-center h-full text-mc-text-secondary py-8">
                    <span className="text-2xl mb-2 opacity-30">
                      {column.id === 'inbox' ? '📥' :
                       column.id === 'assigned' ? '👤' :
                       column.id === 'in_progress' ? '⚡' :
                       column.id === 'testing' ? '🧪' :
                       column.id === 'review' ? '👀' :
                       column.id === 'done' ? '✅' : '⚠️'}
                    </span>
                    <p className="text-xs">No tasks</p>
                  </div>
                )}
                {draggedTask && draggedTask.status !== column.id && columnTasks.length === 0 && (
                  <div className="flex items-center justify-center h-full text-mc-accent/50 py-8">
                    <p className="text-xs font-medium">Drop here</p>
                  </div>
                )}
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onClick={() => setEditingTask(task)}
                    isDragging={draggedTask?.id === task.id}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Undo Toast */}
      {undoState && (
        <div className="fixed bottom-4 right-4 bg-mc-bg-secondary border border-mc-accent rounded-lg shadow-lg p-4 z-50 animate-slide-in">
          <div className="flex items-center gap-3">
            <div className="text-mc-accent">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium">
                Moved "{undoState.taskTitle.substring(0, 20)}{undoState.taskTitle.length > 20 ? '...' : ''}"
              </p>
              <p className="text-xs text-mc-text-secondary">
                {undoState.previousStatus} → {undoState.newStatus}
              </p>
            </div>
            <button
              onClick={handleUndo}
              className="flex items-center gap-1 px-3 py-1 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90"
            >
              Undo ({countdown}s)
            </button>
            <button
              onClick={clearUndo}
              className="p-1 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Analytics Modal */}
      {showAnalytics && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-mc-border">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-mc-accent" />
                <h2 className="text-lg font-semibold">Analytics & Performance</h2>
              </div>
              <button
                onClick={() => setShowAnalytics(false)}
                className="p-1 hover:bg-mc-bg-tertiary rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AnalyticsPanel />
            </div>
          </div>
        </div>
      )}

      {/* Template Picker */}
      {showTemplatePicker && (
        <TemplatePicker
          onSelect={async (template, replacements) => {
            const defaults = formatTemplateDefaults(template, replacements);
            
            try {
              const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: defaults.title,
                  description: defaults.description,
                  priority: defaults.priority,
                  status: defaults.status,
                  assigned_agent_id: defaults.assigned_agent_id || null,
                  due_date: defaults.suggested_due_hours 
                    ? calculateDueDate(defaults.suggested_due_hours)
                    : null,
                  output_dir: defaults.output_dir,
                }),
              });

              if (res.ok) {
                const savedTask = await res.json();
                addTask(savedTask);
                addEvent({
                  id: crypto.randomUUID(),
                  type: 'task_created',
                  task_id: savedTask.id,
                  message: `New ${template.name} task: ${savedTask.title}`,
                  created_at: new Date().toISOString(),
                });
                setShowTemplatePicker(false);
              } else {
                const err = await res.json();
                showError(err.error || 'Failed to create task');
              }
            } catch (error) {
              console.error('Failed to create task:', error);
              showError('Failed to create task');
            }
          }}
          onClose={() => setShowTemplatePicker(false)}
          onSkip={() => {
            setShowTemplatePicker(false);
            setShowCreateModal(true);
          }}
        />
      )}
      
      {showCreateModal && (
        <TaskModal onClose={() => setShowCreateModal(false)} />
      )}
      
      {editingTask && (
        <TaskModal task={editingTask} onClose={() => setEditingTask(null)} />
      )}
    </div>
  );
}

interface TaskCardProps {
  task: Task;
  onDragStart: (e: React.DragEvent, task: Task) => void;
  onDragEnd: () => void;
  onClick: () => void;
  isDragging: boolean;
}

const TaskCard = memo(function TaskCard({ task, onDragStart, onDragEnd, onClick, isDragging }: TaskCardProps) {
  const { updateTask } = useMissionControl();

  const stuckInfo = getStuckInfo(task);
  const stuckClass = stuckInfo.isStuck ? 'border-l-2 border-l-mc-accent-red' : '';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`bg-mc-bg-secondary border border-mc-border rounded p-3 cursor-pointer hover:border-mc-accent/50 transition-all ${
        isDragging ? 'opacity-50 scale-95' : ''
      } ${stuckClass}`}
      title={stuckInfo.isStuck ? `Stuck in ${task.status} for ${formatStuckTime(stuckInfo.minutesInStatus)} (threshold: ${formatStuckTime(stuckInfo.threshold)})` : ''}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-4 h-4 text-mc-text-secondary mt-0.5 cursor-grab" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <h4 className="text-sm font-medium truncate">{task.title}</h4>
            {task.is_blocked && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-mc-accent-red/20 text-mc-accent-red text-xs rounded" title="Blocked by incomplete dependencies">
                <Lock className="w-3 h-3" />
              </span>
            )}
            {!task.is_blocked && (task.dependency_count ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-mc-accent-green/20 text-mc-accent-green text-xs rounded" title="All dependencies completed">
                {task.dependency_count}
              </span>
            )}
            {stuckInfo.isStuck && (
              <span className="text-mc-accent-red" title={`Stuck for ${formatStuckTime(stuckInfo.minutesInStatus)}`}>🔴</span>
            )}
            {(task.retry_count ?? 0) > 0 && (
              <span className="text-xs text-mc-text-secondary" title={`Retried ${task.retry_count} time(s)`}>
                ↻{task.retry_count}
              </span>
            )}
          </div>
          {task.status === 'failed' && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const res = await fetch(`/api/tasks/${task.id}/retry`, { method: 'POST' });
                  if (res.ok) {
                    const data = await res.json();
                    if (data.task) updateTask(data.task);
                  }
                } catch (err) {
                  console.error('Failed to retry task:', err);
                }
              }}
              className="mt-1.5 w-full flex items-center justify-center gap-1.5 px-2 py-1 bg-mc-accent/10 text-mc-accent text-xs rounded hover:bg-mc-accent/20 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Retry Task
            </button>
          )}
          {task.assigned_agent && (
            <div className="flex items-center gap-1 mt-2">
              <span className="text-sm">{(task.assigned_agent as unknown as { avatar_emoji: string }).avatar_emoji}</span>
              <span className="text-xs text-mc-text-secondary truncate">
                {(task.assigned_agent as unknown as { name: string }).name}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between mt-2">
            <span
              className={`text-xs px-2 py-0.5 rounded ${PRIORITY_COLORS[task.priority]}`}
            >
              {task.priority}
            </span>
            <span className="text-xs text-mc-text-secondary">
              {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
