'use client';

import { useState, useCallback } from 'react';
import { Plus, ChevronRight, GripVertical, CheckCircle, ArrowRight, RotateCcw, Sparkles, Brain, Zap, BarChart3, X } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { Task, TaskStatus } from '@/lib/types';
import { TaskModal } from './TaskModal';
import { TemplatePicker } from './TemplatePicker';
import { AnalyticsPanel } from './AnalyticsPanel';
import { TASK_TEMPLATES, formatTemplateDefaults, calculateDueDate, type TaskTemplate } from '@/lib/templates';
import { formatDistanceToNow } from 'date-fns';

// Stuck task thresholds (in minutes)
const STUCK_THRESHOLDS: Record<TaskStatus, number> = {
  'inbox': 60,        // 1 hour
  'assigned': 30,     // 30 min (should dispatch quickly)
  'in_progress': 120, // 2 hours
  'testing': 1440,    // 24 hours
  'review': 480,      // 8 hours
  'done': Infinity,   // Never stuck
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

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'inbox', label: 'INBOX', color: 'border-t-mc-accent-pink' },
  { id: 'assigned', label: 'ASSIGNED', color: 'border-t-mc-accent-yellow' },
  { id: 'in_progress', label: 'IN PROGRESS', color: 'border-t-mc-accent' },
  { id: 'testing', label: 'TESTING', color: 'border-t-mc-accent-cyan' },
  { id: 'review', label: 'REVIEW', color: 'border-t-mc-accent-purple' },
  { id: 'done', label: 'DONE', color: 'border-t-mc-accent-green' },
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [countdown, setCountdown] = useState(5);

  const getTasksByStatus = (status: TaskStatus) =>
    tasks.filter((task) => task.status === status);

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

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    if (!draggedTask || draggedTask.status === targetStatus) {
      setDraggedTask(null);
      return;
    }

    const previousStatus = draggedTask.status;
    const taskTitle = draggedTask.title;

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
        alert(`Cannot move task to ${targetStatus}: ${errorData.detail || errorData.error || 'Workflow rule violation'}`);
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
        alert(`Cannot verify task: ${errorData.detail || errorData.error}`);
        updateTaskStatus(task.id, previousStatus);
      }
    } catch (error) {
      console.error('Failed to verify task:', error);
      updateTaskStatus(task.id, previousStatus);
    }
  };

  // Format stuck time in human readable way
  const formatStuckTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
    return `${Math.floor(minutes / 1440)}d`;
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
                  alert(`Auto-assigned ${assigned} task(s) to optimal agents!`);
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
          
          return (
            <div
              key={column.id}
              className={`flex-1 min-w-[180px] flex flex-col bg-mc-bg rounded border border-mc-border border-t-2 ${column.color}`}
              style={{ maxWidth: 'calc(100% / 6)' }}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              {/* Column Header */}
              <div className="p-2 border-b border-mc-border flex items-center justify-between">
                <span className="text-xs font-medium uppercase text-mc-text-secondary">
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
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onDragStart={handleDragStart}
                    onClick={() => setEditingTask(task)}
                    isDragging={draggedTask?.id === task.id}
                    getStuckInfo={getStuckInfo}
                    formatStuckTime={formatStuckTime}
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
                alert(err.error || 'Failed to create task');
              }
            } catch (error) {
              console.error('Failed to create task:', error);
              alert('Failed to create task');
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
  onClick: () => void;
  isDragging: boolean;
  getStuckInfo: (task: Task) => StuckInfo;
  formatStuckTime: (minutes: number) => string;
}

function TaskCard({ task, onDragStart, onClick, isDragging, getStuckInfo, formatStuckTime }: TaskCardProps) {
  const priorityColors = {
    low: 'bg-mc-text-secondary/20',
    normal: 'bg-mc-accent/20',
    high: 'bg-mc-accent-yellow/20',
    urgent: 'bg-mc-accent-red/20',
  };

  const stuckInfo = getStuckInfo(task);
  const stuckClass = stuckInfo.isStuck ? 'border-l-2 border-l-mc-accent-red' : '';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
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
            {stuckInfo.isStuck && (
              <span className="text-mc-accent-red" title={`Stuck for ${formatStuckTime(stuckInfo.minutesInStatus)}`}>🔴</span>
            )}
          </div>
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
              className={`text-xs px-2 py-0.5 rounded ${priorityColors[task.priority]}`}
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
}
