'use client';

import { useState } from 'react';
import { X, Save, Trash2, Activity, Package, Bot, FolderOpen, Scan, FileText, Sparkles, Copy, Plus, Link, RotateCcw, Phone, Mail, Bell } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { ActivityLog } from './ActivityLog';
import { DeliverablesList } from './DeliverablesList';
import { SessionsList } from './SessionsList';
import { DependenciesList } from './DependenciesList';
import { PromptsLibrary } from './PromptsLibrary';
import { useToast } from '@/hooks/useToast';
import type { Task, TaskPriority, TaskStatus, TaskNotifySettings, Prompt } from '@/lib/types';

type TabType = 'overview' | 'dependencies' | 'activity' | 'deliverables' | 'sessions';

interface TaskModalProps {
  task?: Task;
  onClose: () => void;
}

export function TaskModal({ task, onClose }: TaskModalProps) {
  const { agents, addTask, updateTask, addEvent } = useMissionControl();
  const { success, error: showError } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showPromptsLibrary, setShowPromptsLibrary] = useState(false);

  const existingNotify: TaskNotifySettings = (() => {
    if (!task?.notify_settings) return {};
    if (typeof task.notify_settings === 'string') {
      try { return JSON.parse(task.notify_settings); } catch { return {}; }
    }
    return task.notify_settings;
  })();

  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    priority: task?.priority || 'normal' as TaskPriority,
    status: task?.status || 'inbox' as TaskStatus,
    assigned_agent_id: task?.assigned_agent_id || '',
    due_date: task?.due_date || '',
    output_dir: task?.output_dir || '',
    use_prompt_dir: task?.output_dir === null || task?.output_dir === undefined || task?.output_dir === '',
    notify_phone: existingNotify.phone || '',
    notify_email: existingNotify.email || '',
    notify_on_complete: existingNotify.on_complete !== false,
    notify_on_failure: existingNotify.on_failure !== false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const url = task ? `/api/tasks/${task.id}` : '/api/tasks';
      const method = task ? 'PATCH' : 'POST';

      const notifySettings: TaskNotifySettings | null =
        form.notify_phone || form.notify_email
          ? {
              phone: form.notify_phone || undefined,
              email: form.notify_email || undefined,
              on_complete: form.notify_on_complete,
              on_failure: form.notify_on_failure,
            }
          : null;

      const payload = {
        title: form.title,
        description: form.description,
        priority: form.priority,
        status: form.status,
        assigned_agent_id: form.assigned_agent_id || null,
        due_date: form.due_date || null,
        output_dir: form.use_prompt_dir ? null : form.output_dir || null,
        notify_settings: notifySettings,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const savedTask = await res.json();

        if (task) {
          updateTask(savedTask);
        } else {
          addTask(savedTask);
          addEvent({
            id: crypto.randomUUID(),
            type: 'task_created',
            task_id: savedTask.id,
            message: `New task: ${savedTask.title}`,
            created_at: new Date().toISOString(),
          });
        }
        onClose();
      }
    } catch (error) {
      console.error('Failed to save task:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!task || !confirm(`Delete "${task.title}"?`)) return;

    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      if (res.ok) {
        useMissionControl.setState((state) => ({
          tasks: state.tasks.filter((t) => t.id !== task.id),
        }));
        onClose();
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleCopyTask = async () => {
    if (!task) return;

    if (!confirm(`Create a copy of "${task.title}" in Inbox?`)) return;

    try {
      const res = await fetch(`/api/tasks/${task.id}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          copy_title: true,
          copy_description: true,
          copy_assigned_agent: false, // Don't copy assignment - let user reassign
          copy_output_dir: false, // Don't copy output dir - new task needs new location
          copy_priority: true,
          title_suffix: ' (Copy)'
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.new_task) {
          addTask(data.new_task);
          addEvent({
            id: crypto.randomUUID(),
            type: 'task_created',
            task_id: data.new_task.id,
            message: `Task copied: ${data.new_task.title}`,
            created_at: new Date().toISOString(),
          });
          success(`Task copied! "${data.new_task.title}" is now in Inbox.`);
        }
      } else {
        const err = await res.json();
        showError(err.error || 'Failed to copy task');
      }
    } catch (error) {
      console.error('Failed to copy task:', error);
      showError('Failed to copy task');
    }
  };

  const handleSelectPrompt = (selectedPrompt: Prompt) => {
    // Extract variables from prompt content
    const variableRegex = /\{\{(\w+)\}\}/g;
    const variables: string[] = [];
    let match;
    while ((match = variableRegex.exec(selectedPrompt.content)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    if (variables.length > 0) {
      // Ask for variable values
      const values: Record<string, string> = {};
      for (const v of variables) {
        const defaultValue = v.includes('dir') || v.includes('path') || v.includes('output')
          ? `~/openclaw/workspace/projects/${selectedPrompt.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
          : '';
        const userValue = window.prompt(`Enter value for "{{${v}}}":`, defaultValue);
        if (userValue === null) return; // User cancelled
        values[v] = userValue;
      }

      // Replace variables in content
      let filledContent = selectedPrompt.content;
      for (const [key, value] of Object.entries(values)) {
        filledContent = filledContent.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }

      // Also try to get output_dir from values
      const outputDir = values['output_dir'] || values['outputDir'] || values['outputdir'] || 
                       values['output_path'] || values['path'] || '';

      setForm({
        ...form,
        title: selectedPrompt.title,
        description: filledContent,
        output_dir: outputDir,
        use_prompt_dir: !outputDir,
      });
    } else {
      // No variables, use as-is
      setForm({
        ...form,
        title: selectedPrompt.title,
        description: selectedPrompt.content,
      });
    }

    setShowPromptsLibrary(false);
  };

  const statuses: TaskStatus[] = ['inbox', 'assigned', 'in_progress', 'testing', 'review', 'done', 'failed'];
  const priorities: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: null },
    { id: 'dependencies' as TabType, label: 'Dependencies', icon: <Link className="w-4 h-4" /> },
    { id: 'activity' as TabType, label: 'Activity', icon: <Activity className="w-4 h-4" /> },
    { id: 'deliverables' as TabType, label: 'Deliverables', icon: <Package className="w-4 h-4" /> },
    { id: 'sessions' as TabType, label: 'Sessions', icon: <Bot className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-mc-border flex-shrink-0">
          <h2 id="task-modal-title" className="text-lg font-semibold">
            {task ? task.title : 'Create New Task'}
          </h2>
          <div className="flex items-center gap-2">
            {!task && (
              <button
                onClick={() => setShowPromptsLibrary(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-mc-accent bg-mc-accent/10 hover:bg-mc-accent/20 rounded-md transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                Use Prompt
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 hover:bg-mc-bg-tertiary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mc-accent"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs - only show for existing tasks */}
        {task && (
          <div className="flex border-b border-mc-border flex-shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-mc-accent border-b-2 border-mc-accent'
                    : 'text-mc-text-secondary hover:text-mc-text'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <form onSubmit={handleSubmit} className="space-y-4">
          {/* Failed Banner */}
          {task?.status === 'failed' && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
              <span className="text-lg">⚠️</span>
              <div className="flex-1">
                <span className="font-medium">Task Failed</span>
                {(task.retry_count ?? 0) > 0 && (
                  <span className="text-red-400/70 ml-2">
                    ({task.retry_count}/{task.max_retries ?? 2} retries used)
                  </span>
                )}
              </div>
            </div>
          )}
          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
              placeholder="What needs to be done?"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent resize-none"
              placeholder="Add details..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Status */}
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}
                className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ').toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
              >
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    {p.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Assigned Agent */}
          <div>
            <label className="block text-sm font-medium mb-1">Assign to</label>
            <select
              value={form.assigned_agent_id}
              onChange={(e) => setForm({ ...form, assigned_agent_id: e.target.value })}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            >
              <option value="">Unassigned</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.avatar_emoji} {agent.name} - {agent.role}
                </option>
              ))}
            </select>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium mb-1">Due Date</label>
            <input
              type="datetime-local"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            />
          </div>

          {/* Output Directory */}
          <div>
            <label className="block text-sm font-medium mb-1">Output Directory</label>
            
            {/* Checkbox to bypass output_dir (use prompt-specified directory) */}
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="use_prompt_dir"
                checked={form.use_prompt_dir}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm({
                    ...form,
                    use_prompt_dir: checked,
                    output_dir: checked ? '' : form.output_dir || `~/openclaw/workspace/projects/${form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
                  });
                }}
                className="w-4 h-4 rounded border-mc-border bg-mc-bg checked:bg-mc-accent"
              />
              <label htmlFor="use_prompt_dir" className="text-sm text-mc-text-secondary cursor-pointer">
                Use directory specified in prompt (bypass auto-generation)
              </label>
            </div>
            
            {/* Output directory input - shown when not using prompt directory */}
            {!form.use_prompt_dir && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.output_dir}
                  onChange={(e) => setForm({ ...form, output_dir: e.target.value })}
                  className="flex-1 bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-mc-accent"
                  placeholder={task?.output_dir ? undefined : `Default: ~/openclaw/workspace/projects/${form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
                />
                <button
                  type="button"
                  onClick={() => {
                    const defaultDir = `~/openclaw/workspace/projects/${form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
                    setForm({ ...form, output_dir: defaultDir });
                  }}
                  className="px-3 py-2 bg-mc-bg-tertiary border border-mc-border rounded text-sm hover:bg-mc-bg"
                  title="Use auto-generated path"
                >
                  Auto
                </button>
              </div>
            )}
            <p className="text-xs text-mc-text-secondary mt-1">
              {form.use_prompt_dir 
                ? "Agent will use the directory you specify in the task description." 
                : "Directory where the agent will save deliverables."}
            </p>
            
            {/* Quick action buttons for existing task with output_dir */}
            {task && (task.output_dir || form.output_dir) && !form.use_prompt_dir && (
              <div className="flex gap-2 mt-2">
                <a
                  href={`/api/files/browse?path=${encodeURIComponent(task.output_dir || form.output_dir || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 bg-mc-bg-tertiary border border-mc-border rounded text-sm hover:bg-mc-bg hover:border-mc-accent"
                >
                  <FolderOpen className="w-4 h-4" />
                  Open Folder
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/tasks/${task.id}/deliverables/scan`, { method: 'POST' });
                      if (res.ok) {
                        success('Deliverables scanned successfully');
                      } else {
                        const err = await res.json();
                        showError(err.error || 'Scan failed');
                      }
                    } catch (e) {
                      showError('Failed to scan deliverables');
                    }
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-mc-bg-tertiary border border-mc-border rounded text-sm hover:bg-mc-bg hover:border-mc-accent"
                >
                  <Scan className="w-4 h-4" />
                  Scan Files
                </button>
              </div>
            )}
          </div>
          {/* Notifications */}
          <div className="mt-4 p-4 bg-mc-bg rounded-lg border border-mc-border">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="w-4 h-4 text-mc-accent" />
              <label className="text-sm font-medium text-mc-text">Notify on Complete / Fail</label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
                <input
                  type="tel"
                  value={form.notify_phone}
                  onChange={(e) => setForm({ ...form, notify_phone: e.target.value })}
                  placeholder="Phone (e.g. +201006677770)"
                  className="flex-1 bg-mc-bg-secondary border border-mc-border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-mc-accent"
                />
              </div>

              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
                <input
                  type="email"
                  value={form.notify_email}
                  onChange={(e) => setForm({ ...form, notify_email: e.target.value })}
                  placeholder="Email (e.g. user@example.com)"
                  className="flex-1 bg-mc-bg-secondary border border-mc-border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-mc-accent"
                />
              </div>

              {(form.notify_phone || form.notify_email) && (
                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-1.5 text-sm text-mc-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.notify_on_complete}
                      onChange={(e) => setForm({ ...form, notify_on_complete: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-mc-border"
                    />
                    On complete
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-mc-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.notify_on_failure}
                      onChange={(e) => setForm({ ...form, notify_on_failure: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-mc-border"
                    />
                    On failure
                  </label>
                </div>
              )}

              {!form.notify_phone && !form.notify_email && (
                <p className="text-xs text-mc-text-secondary">
                  Add a phone number or email to get notified when this task completes or fails.
                </p>
              )}
            </div>
          </div>
            </form>
          )}

          {/* Dependencies Tab */}
          {activeTab === 'dependencies' && task && (
            <DependenciesList taskId={task.id} />
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && task && (
            <ActivityLog taskId={task.id} />
          )}

          {/* Deliverables Tab */}
          {activeTab === 'deliverables' && task && (
            <DeliverablesList taskId={task.id} />
          )}

          {/* Sessions Tab */}
          {activeTab === 'sessions' && task && (
            <SessionsList taskId={task.id} />
          )}
        </div>

        {/* Footer - only show on overview tab */}
        {activeTab === 'overview' && (
          <div className="flex items-center justify-between p-4 border-t border-mc-border flex-shrink-0">
            <div className="flex gap-2">
              {task && (
                <>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex items-center gap-2 px-3 py-2 text-mc-accent-red hover:bg-mc-accent-red/10 rounded text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyTask}
                    className="flex items-center gap-2 px-3 py-2 text-mc-accent hover:bg-mc-accent/10 rounded text-sm"
                    title="Copy to Inbox as new task"
                  >
                    <Copy className="w-4 h-4" />
                    Copy to Inbox
                  </button>
                  {task.status === 'failed' && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/tasks/${task.id}/retry`, { method: 'POST' });
                          if (res.ok) {
                            const data = await res.json();
                            if (data.task) {
                              updateTask(data.task);
                            }
                            onClose();
                          }
                        } catch (err) {
                          console.error('Failed to retry task:', err);
                        }
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-mc-accent text-white hover:bg-mc-accent/80 rounded text-sm"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Retry{(task.retry_count ?? 0) > 0 ? ` (${task.retry_count})` : ''}
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-mc-text-secondary hover:text-mc-text"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-4 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* Prompts Library Modal */}
        <PromptsLibrary
          isOpen={showPromptsLibrary}
          onClose={() => setShowPromptsLibrary(false)}
          onSelectPrompt={handleSelectPrompt}
          selectMode={true}
        />
      </div>
    </div>
  );
}
