'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { Task, Agent } from '@/lib/types';

const STATUS_COLORS: Record<string, string> = {
  inbox: 'bg-pink-500/20 text-pink-400',
  assigned: 'bg-yellow-500/20 text-yellow-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  testing: 'bg-cyan-500/20 text-cyan-400',
  review: 'bg-purple-500/20 text-purple-400',
  done: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
};

interface SearchResults {
  tasks: Task[];
  agents: Agent[];
}

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { setSelectedTask, setSelectedAgent } = useMissionControl();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  const totalResults = results ? results.tasks.length + results.agents.length : 0;

  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults(null);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=15`);
      if (res.ok) {
        const data: SearchResults = await res.json();
        setResults(data);
        setIsOpen(true);
        setSelectedIndex(0);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(value), 300);
  };

  const handleSelectTask = (task: Task) => {
    setSelectedTask(task);
    setQuery('');
    setResults(null);
    setIsOpen(false);
  };

  const handleSelectAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setQuery('');
    setResults(null);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (!isOpen || !results) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, totalResults - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      let idx = selectedIndex;
      if (idx < results.tasks.length) {
        handleSelectTask(results.tasks[idx]);
      } else {
        idx -= results.tasks.length;
        if (idx < results.agents.length) {
          handleSelectAgent(results.agents[idx]);
        }
      }
    }
  };

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Cleanup debounce
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 bg-mc-bg border border-mc-border rounded px-3 py-1.5 focus-within:border-mc-accent transition-colors">
        <Search className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (results) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder="Search tasks, agents..."
          className="bg-transparent text-sm text-mc-text placeholder:text-mc-text-secondary focus:outline-none w-48"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults(null); setIsOpen(false); }}
            className="p-0.5 text-mc-text-secondary hover:text-mc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mc-accent rounded"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {isOpen && results && (
        <div className="absolute top-full left-0 mt-1 w-96 max-h-80 overflow-y-auto bg-mc-bg-secondary border border-mc-border rounded-lg shadow-lg z-50">
          {totalResults === 0 ? (
            <div className="p-4 text-sm text-mc-text-secondary text-center">
              {isLoading ? 'Searching...' : 'No results found'}
            </div>
          ) : (
            <>
              {/* Tasks */}
              {results.tasks.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-medium text-mc-text-secondary uppercase tracking-wider bg-mc-bg-tertiary">
                    Tasks ({results.tasks.length})
                  </div>
                  {results.tasks.map((task, i) => (
                    <button
                      key={task.id}
                      onClick={() => handleSelectTask(task)}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-mc-bg-tertiary transition-colors ${
                        selectedIndex === i ? 'bg-mc-bg-tertiary' : ''
                      }`}
                    >
                      <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[task.status] || 'bg-mc-bg-tertiary text-mc-text-secondary'}`}>
                        {task.status.replace('_', ' ')}
                      </span>
                      <span className="text-sm text-mc-text truncate flex-1">
                        {task.title}
                      </span>
                      {(task as any).assigned_agent_emoji && (
                        <span className="text-sm" title={(task as any).assigned_agent_name}>
                          {(task as any).assigned_agent_emoji}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Agents */}
              {results.agents.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-medium text-mc-text-secondary uppercase tracking-wider bg-mc-bg-tertiary">
                    Agents ({results.agents.length})
                  </div>
                  {results.agents.map((agent, i) => (
                    <button
                      key={agent.id}
                      onClick={() => handleSelectAgent(agent)}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-mc-bg-tertiary transition-colors ${
                        selectedIndex === results.tasks.length + i ? 'bg-mc-bg-tertiary' : ''
                      }`}
                    >
                      <span className="text-lg">{agent.avatar_emoji}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-mc-text">{agent.name}</span>
                        <span className="text-xs text-mc-text-secondary ml-2">{agent.role}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
