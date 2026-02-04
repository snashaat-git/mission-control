'use client';

import { useEffect, useState } from 'react';
import { X, Plus, Search, Copy, Sparkles, Bot, Trash2, Edit2, Check, Library } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { Prompt, Agent } from '@/lib/types';

interface PromptsLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt?: (prompt: Prompt) => void;
  selectMode?: boolean;
}

export function PromptsLibrary({ isOpen, onClose, onSelectPrompt, selectMode }: PromptsLibraryProps) {
  const { agents } = useMissionControl();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);

  useEffect(() => {
    if (isOpen) loadPrompts();
  }, [isOpen]);

  const loadPrompts = async () => {
    try {
      const res = await fetch('/api/prompts');
      if (res.ok) {
        setPrompts(await res.json());
      }
    } catch (error) {
      console.error('Failed to load prompts:', error);
    } finally {
      setLoading(false);
    }
  };

  const deletePrompt = async (id: string) => {
    if (!confirm('Delete this prompt?')) return;
    
    try {
      const res = await fetch(`/api/prompts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPrompts(prompts.filter(p => p.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete prompt:', error);
    }
  };

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const filteredPrompts = prompts.filter(p => {
    const matchesSearch = search === '' || 
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.content.toLowerCase().includes(search.toLowerCase()) ||
      (p.description?.toLowerCase() || '').includes(search.toLowerCase());
    
    const matchesCategory = category === 'all' || p.category === category;
    
    return matchesSearch && matchesCategory;
  });

  const categories = ['all', ...Array.from(new Set(prompts.map(p => p.category)))];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-mc-border">
          <div className="flex items-center gap-2">
            <Library className="w-5 h-5 text-mc-accent" />
            <h2 className="text-lg font-semibold">Prompts Library</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-mc-bg-tertiary rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Filter */}
        <div className="p-4 border-b border-mc-border space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mc-text-secondary" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search prompts..."
                className="w-full bg-mc-bg border border-mc-border rounded pl-10 pr-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'All Categories' : cat}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90"
            >
              <Plus className="w-4 h-4" />
              New
            </button>
          </div>
        </div>

        {/* Prompts List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-mc-text-secondary">Loading prompts...</div>
            </div>
          ) : filteredPrompts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-mc-text-secondary">
              <Sparkles className="w-12 h-12 mb-4 opacity-50" />
              <p>No prompts found</p>
              <p className="text-sm mt-1">Create your first prompt to get started</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredPrompts.map(prompt => (
                <div
                  key={prompt.id}
                  className="bg-mc-bg border border-mc-border rounded-lg p-4 hover:border-mc-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-mc-text truncate">{prompt.title}</h3>
                        {prompt.is_template && (
                          <span className="px-2 py-0.5 bg-mc-accent/20 text-mc-accent text-xs rounded">
                            Template
                          </span>
                        )}
                      </div>
                      
                      {prompt.description && (
                        <p className="text-sm text-mc-text-secondary mb-2 line-clamp-2">
                          {prompt.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-mc-text-secondary">
                        <span className="capitalize">{prompt.category}</span>
                        {prompt.agent_name && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              {prompt.agent_emoji} {prompt.agent_name}
                            </span>
                          </>
                        )}
                        {prompt.usage_count > 0 && (
                          <>
                            <span>•</span>
                            <span>Used {prompt.usage_count} times</span>
                          </>
                        )}
                      </div>

                      {/* Preview of content */}
                      <div className="mt-3 p-2 bg-mc-bg-tertiary rounded text-sm text-mc-text-secondary font-mono line-clamp-2">
                        {prompt.content.substring(0, 100)}...
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {selectMode ? (
                        <button
                          onClick={() => {
                            onSelectPrompt?.(prompt);
                            onClose();
                          }}
                          className="px-3 py-1.5 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90"
                        >
                          Use
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => copyToClipboard(prompt.content)}
                            className="p-1.5 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
                            title="Copy to clipboard"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingPrompt(prompt)}
                            className="p-1.5 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deletePrompt(prompt.id)}
                            className="p-1.5 hover:bg-mc-bg-tertiary rounded text-mc-accent-red"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingPrompt) && (
        <PromptModal
          prompt={editingPrompt}
          agents={agents}
          onClose={() => {
            setShowCreateModal(false);
            setEditingPrompt(null);
          }}
          onSave={() => {
            loadPrompts();
            setShowCreateModal(false);
            setEditingPrompt(null);
          }}
        />
      )}
    </div>
  );
}

// Prompt Create/Edit Modal
interface PromptModalProps {
  prompt: Prompt | null;
  agents: Agent[];
  onClose: () => void;
  onSave: () => void;
}

function PromptModal({ prompt, agents, onClose, onSave }: PromptModalProps) {
  const [form, setForm] = useState({
    title: prompt?.title || '',
    content: prompt?.content || '',
    description: prompt?.description || '',
    category: prompt?.category || 'general',
    agent_id: prompt?.agent_id || '',
    is_template: prompt?.is_template || false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const url = prompt ? `/api/prompts/${prompt.id}` : '/api/prompts';
      const method = prompt ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        onSave();
      }
    } catch (error) {
      console.error('Failed to save prompt:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-mc-border">
          <h3 className="font-semibold">{prompt ? 'Edit Prompt' : 'New Prompt'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-mc-bg-tertiary rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
              placeholder="e.g., Landing Page Generator"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
              placeholder="e.g., coding, writing, analysis"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Assigned Agent (optional)</label>
            <select
              value={form.agent_id}
              onChange={(e) => setForm({ ...form, agent_id: e.target.value })}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
            >
              <option value="">Any Agent</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.avatar_emoji} {agent.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description (optional)</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
              placeholder="Brief description of what this prompt does"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Prompt Content</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              required
              rows={8}
              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent resize-none font-mono"
              placeholder="Enter your prompt here... Use {{variable}} for dynamic values"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_template"
              checked={form.is_template}
              onChange={(e) => setForm({ ...form, is_template: e.target.checked })}
              className="w-4 h-4 rounded border-mc-border"
            />
            <label htmlFor="is_template" className="text-sm cursor-pointer">
              Mark as reusable template
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-mc-text-secondary hover:text-mc-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Prompt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
