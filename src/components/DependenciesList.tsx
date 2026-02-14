'use client';

import { useEffect, useState } from 'react';
import { Plus, X, Link, ArrowRight, Search, AlertTriangle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { Task, TaskDependency, TaskStatus } from '@/lib/types';

interface DependenciesListProps {
  taskId: string;
}

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  inbox: { bg: 'bg-mc-accent-pink/20', text: 'text-mc-accent-pink' },
  assigned: { bg: 'bg-mc-accent-yellow/20', text: 'text-mc-accent-yellow' },
  in_progress: { bg: 'bg-mc-accent/20', text: 'text-mc-accent' },
  testing: { bg: 'bg-mc-accent-cyan/20', text: 'text-mc-accent-cyan' },
  review: { bg: 'bg-mc-accent-purple/20', text: 'text-mc-accent-purple' },
  done: { bg: 'bg-mc-accent-green/20', text: 'text-mc-accent-green' },
};

export function DependenciesList({ taskId }: DependenciesListProps) {
  const { tasks } = useMissionControl();
  const [dependsOn, setDependsOn] = useState<(TaskDependency & { dependency_title?: string; dependency_status?: string })[]>([]);
  const [blocking, setBlocking] = useState<(TaskDependency & { dependent_title?: string; dependent_status?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadDependencies();
  }, [taskId]);

  const loadDependencies = async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/dependencies`);
      if (res.ok) {
        const data = await res.json();
        setDependsOn(data.depends_on || []);
        setBlocking(data.blocking || []);
      }
    } catch (e) {
      console.error('Failed to load dependencies:', e);
    } finally {
      setLoading(false);
    }
  };

  const addDependency = async (depId: string) => {
    setError('');
    try {
      const res = await fetch(`/api/tasks/${taskId}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dependency_id: depId }),
      });

      if (res.ok) {
        await loadDependencies();
        setShowPicker(false);
        setSearch('');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to add dependency');
      }
    } catch (e) {
      setError('Failed to add dependency');
    }
  };

  const removeDependency = async (depId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/dependencies/${depId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDependsOn(prev => prev.filter(d => d.dependency_id !== depId));
      }
    } catch (e) {
      console.error('Failed to remove dependency:', e);
    }
  };

  // Filter available tasks for the picker
  const existingDepIds = new Set(dependsOn.map(d => d.dependency_id));
  const availableTasks = tasks.filter(t =>
    t.id !== taskId &&
    !existingDepIds.has(t.id) &&
    (search === '' || t.title.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-mc-text-secondary">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading dependencies...
      </div>
    );
  }

  const allDepsComplete = dependsOn.length > 0 && dependsOn.every(d => d.dependency_status === 'done');
  const hasIncompleteDeps = dependsOn.some(d => d.dependency_status !== 'done');

  return (
    <div className="space-y-6">
      {/* Summary Banner */}
      {dependsOn.length > 0 && (
        <div className={`flex items-center gap-2 p-3 rounded text-sm ${
          hasIncompleteDeps
            ? 'bg-mc-accent-red/10 text-mc-accent-red'
            : 'bg-mc-accent-green/10 text-mc-accent-green'
        }`}>
          {hasIncompleteDeps ? (
            <>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Blocked: {dependsOn.filter(d => d.dependency_status !== 'done').length} dependency(ies) not yet completed</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>All dependencies completed</span>
            </>
          )}
        </div>
      )}

      {/* Depends On Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider">
            Depends On ({dependsOn.length})
          </h3>
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-mc-accent hover:bg-mc-accent/10 rounded transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>

        {/* Task Picker */}
        {showPicker && (
          <div className="mb-3 p-3 bg-mc-bg border border-mc-border rounded-lg space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-mc-text-secondary" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks..."
                autoFocus
                className="w-full bg-mc-bg-secondary border border-mc-border rounded pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:border-mc-accent"
              />
            </div>
            {error && (
              <p className="text-xs text-mc-accent-red">{error}</p>
            )}
            <div className="max-h-40 overflow-y-auto space-y-1">
              {availableTasks.length === 0 ? (
                <p className="text-xs text-mc-text-secondary py-2 text-center">No matching tasks</p>
              ) : (
                availableTasks.slice(0, 10).map(t => {
                  const badge = STATUS_BADGE[t.status] || STATUS_BADGE.inbox;
                  return (
                    <button
                      key={t.id}
                      onClick={() => addDependency(t.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-mc-bg-tertiary rounded text-left text-sm transition-colors"
                    >
                      <span className={`px-1.5 py-0.5 rounded text-xs ${badge.bg} ${badge.text}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                      <span className="truncate flex-1">{t.title}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Dependency List */}
        {dependsOn.length === 0 ? (
          <p className="text-sm text-mc-text-secondary italic">No dependencies</p>
        ) : (
          <div className="space-y-2">
            {dependsOn.map(dep => {
              const badge = STATUS_BADGE[dep.dependency_status || 'inbox'] || STATUS_BADGE.inbox;
              const isDone = dep.dependency_status === 'done';
              return (
                <div
                  key={dep.dependency_id}
                  className="flex items-center gap-2 p-2 bg-mc-bg border border-mc-border rounded group"
                >
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-mc-accent-green flex-shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-mc-accent-yellow flex-shrink-0" />
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-xs ${badge.bg} ${badge.text}`}>
                    {(dep.dependency_status || 'inbox').replace('_', ' ')}
                  </span>
                  <span className={`text-sm truncate flex-1 ${isDone ? 'line-through text-mc-text-secondary' : ''}`}>
                    {dep.dependency_title}
                  </span>
                  <button
                    onClick={() => removeDependency(dep.dependency_id)}
                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-mc-accent-red/10 rounded text-mc-accent-red transition-opacity"
                    title="Remove dependency"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Blocking Section (read-only) */}
      <div>
        <h3 className="text-sm font-medium text-mc-text-secondary uppercase tracking-wider mb-3">
          Blocking ({blocking.length})
        </h3>
        {blocking.length === 0 ? (
          <p className="text-sm text-mc-text-secondary italic">Not blocking any tasks</p>
        ) : (
          <div className="space-y-2">
            {blocking.map(dep => {
              const badge = STATUS_BADGE[dep.dependent_status || 'inbox'] || STATUS_BADGE.inbox;
              return (
                <div
                  key={dep.task_id}
                  className="flex items-center gap-2 p-2 bg-mc-bg border border-mc-border rounded"
                >
                  <Link className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
                  <span className={`px-1.5 py-0.5 rounded text-xs ${badge.bg} ${badge.text}`}>
                    {(dep.dependent_status || 'inbox').replace('_', ' ')}
                  </span>
                  <span className="text-sm truncate flex-1">{dep.dependent_title}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-mc-text-secondary flex-shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
