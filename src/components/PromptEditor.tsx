'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  X, Save, Sparkles, Wand2, AlertCircle, 
  CheckCircle, Lightbulb, FileText, Zap,
  ChevronDown, ChevronRight, Copy, RotateCcw
} from 'lucide-react';
import type { Prompt } from '@/lib/types';

interface PromptAnalysis {
  clarity_score: number;
  structure_score: number;
  completeness_score: number;
  variable_usage: {
    variables: string[];
    undefined_vars: string[];
    suggestions: string[];
  };
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  enhanced_version?: string;
}

interface PromptEditorProps {
  prompt: Prompt | null;
  agents: { id: string; name: string; avatar_emoji: string }[];
  onClose: () => void;
  onSave: (prompt: Prompt) => void;
}

export function PromptEditor({ prompt, agents, onClose, onSave }: PromptEditorProps) {
  const [form, setForm] = useState({
    title: prompt?.title || '',
    content: prompt?.content || '',
    description: prompt?.description || '',
    category: prompt?.category || 'general',
    agent_id: prompt?.agent_id || '',
    is_template: prompt?.is_template || false,
    tags: Array.isArray(prompt?.tags) ? prompt.tags : (prompt?.tags ? JSON.parse(prompt.tags) : []),
  });
  
  const [analysis, setAnalysis] = useState<PromptAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showEnhanced, setShowEnhanced] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'analyze' | 'enhance'>('edit');
  const [templates, setTemplates] = useState<any>(null);

  // Analyze prompt on content change (debounced)
  useEffect(() => {
    if (!form.content || activeTab !== 'analyze') return;
    
    const timer = setTimeout(() => {
      analyzePrompt();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [form.content, form.title, activeTab]);

  const analyzePrompt = async () => {
    if (!form.title || !form.content) return;
    
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/prompts/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, content: form.content, mode: 'analyze' }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setAnalysis(data.analysis);
      }
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const enhancePrompt = async () => {
    if (!form.title || !form.content) return;
    
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/prompts/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, content: form.content, mode: 'enhance' }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setAnalysis(data.analysis);
        setShowEnhanced(true);
      }
    } catch (error) {
      console.error('Enhancement failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyEnhanced = () => {
    if (analysis?.enhanced_version) {
      setForm({ ...form, content: analysis.enhanced_version });
      setShowEnhanced(false);
      setActiveTab('edit');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const url = prompt ? `/api/prompts/${prompt.id}` : '/api/prompts';
      const method = prompt ? 'PUT' : 'POST';

      const payload = {
        ...form,
        tags: form.tags.length > 0 ? JSON.stringify(form.tags) : null,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const savedPrompt = await res.json();
        onSave(savedPrompt);
      }
    } catch (error) {
      console.error('Failed to save prompt:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-500/20';
    if (score >= 60) return 'bg-yellow-500/20';
    return 'bg-red-500/20';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-mc-border">
          <div className="flex items-center gap-3">
            <Wand2 className="w-5 h-5 text-mc-accent" />
            <h2 className="text-lg font-semibold">
              {prompt ? 'Edit Prompt' : 'Create Prompt'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-mc-bg-tertiary rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-mc-border">
          {[
            { id: 'edit', label: 'Edit', icon: FileText },
            { id: 'analyze', label: 'Analyze', icon: AlertCircle },
            { id: 'enhance', label: 'Enhance', icon: Sparkles },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'text-mc-accent border-b-2 border-mc-accent'
                  : 'text-mc-text-secondary hover:text-mc-text'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'edit' && (
            <form className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
                    placeholder="e.g., coding, writing, research"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Assigned Agent</label>
                  <select
                    value={form.agent_id}
                    onChange={(e) => setForm({ ...form, agent_id: e.target.value })}
                    className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
                  >
                    <option value="">Any Agent</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.avatar_emoji} {agent.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={form.tags.join(', ')}
                    onChange={(e) => setForm({ ...form, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                    className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
                    placeholder="web, frontend, react"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
                  placeholder="Brief description of what this prompt does"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium">Prompt Content</label>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_template}
                        onChange={(e) => setForm({ ...form, is_template: e.target.checked })}
                        className="w-4 h-4 rounded border-mc-border"
                      />
                      Reusable Template
                    </label>
                  </div>
                </div>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  required
                  rows={12}
                  className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent resize-none font-mono"
                  placeholder="Enter your prompt here... Use {{variable}} for dynamic values&#10;&#10;Example:&#10;## Goal&#10;Create a {{project_type}} for {{company_name}}&#10;&#10;## Requirements&#10;- Must be responsive&#10;- Use {{primary_color}} as main color&#10;&#10;## Output&#10;Save to: {{output_dir}}"
                />
                <p className="text-xs text-mc-text-secondary mt-1">
                  Use {'{{variable}}'} syntax for dynamic values. These will be prompted when using the template.
                </p>
              </div>
            </form>
          )}

          {activeTab === 'analyze' && (
            <div className="space-y-4">
              {isAnalyzing ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex items-center gap-2 text-mc-text-secondary">
                    <div className="w-5 h-5 border-2 border-mc-accent border-t-transparent rounded-full animate-spin" />
                    Analyzing prompt...
                  </div>
                </div>
              ) : analysis ? (
                <>
                  {/* Score Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Clarity', score: analysis.clarity_score },
                      { label: 'Structure', score: analysis.structure_score },
                      { label: 'Completeness', score: analysis.completeness_score },
                    ].map(({ label, score }) => (
                      <div key={label} className={`p-4 rounded-lg ${getScoreBg(score)}`}>
                        <div className="text-sm text-mc-text-secondary mb-1">{label}</div>
                        <div className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}/100</div>
                      </div>
                    ))}
                  </div>

                  {/* Variables */}
                  {analysis.variable_usage.variables.length > 0 && (
                    <div className="bg-mc-bg border border-mc-border rounded-lg p-4">
                      <h3 className="font-medium mb-3 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-mc-accent" />
                        Variables Detected ({analysis.variable_usage.variables.length})
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {analysis.variable_usage.variables.map((v) => (
                          <code key={v} className="px-2 py-1 bg-mc-accent/10 text-mc-accent rounded text-sm">
                            {'{{' + v + '}}'}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strengths */}
                  {analysis.strengths.length > 0 && (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                      <h3 className="font-medium mb-3 flex items-center gap-2 text-green-400">
                        <CheckCircle className="w-4 h-4" />
                        Strengths
                      </h3>
                      <ul className="space-y-2">
                        {analysis.strengths.map((s, i) => (
                          <li key={i} className="text-sm text-mc-text flex items-start gap-2">
                            <span className="text-green-400 mt-0.5">+</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Weaknesses */}
                  {analysis.weaknesses.length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                      <h3 className="font-medium mb-3 flex items-center gap-2 text-red-400">
                        <AlertCircle className="w-4 h-4" />
                        Areas for Improvement
                      </h3>
                      <ul className="space-y-2">
                        {analysis.weaknesses.map((w, i) => (
                          <li key={i} className="text-sm text-mc-text flex items-start gap-2">
                            <span className="text-red-400 mt-0.5">•</span>
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Suggestions */}
                  {analysis.suggestions.length > 0 && (
                    <div className="bg-mc-accent/10 border border-mc-accent/20 rounded-lg p-4">
                      <h3 className="font-medium mb-3 flex items-center gap-2 text-mc-accent">
                        <Lightbulb className="w-4 h-4" />
                        Suggestions
                      </h3>
                      <ul className="space-y-2">
                        {analysis.suggestions.map((s, i) => (
                          <li key={i} className="text-sm text-mc-text flex items-start gap-2">
                            <span className="text-mc-accent mt-0.5">→</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-mc-text-secondary">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Enter a title and content to see analysis</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'enhance' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-mc-text-secondary">
                  AI will analyze your prompt and suggest structural improvements.
                </p>
                <button
                  onClick={enhancePrompt}
                  disabled={isAnalyzing || !form.title || !form.content}
                  className="flex items-center gap-2 px-4 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-mc-bg border-t-transparent rounded-full animate-spin" />
                      Enhancing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Auto-Enhance
                    </>
                  )}
                </button>
              </div>

              {showEnhanced && analysis?.enhanced_version && (
                <div className="border border-mc-border rounded-lg overflow-hidden">
                  <div className="bg-mc-bg-tertiary px-4 py-2 flex items-center justify-between">
                    <span className="text-sm font-medium">Enhanced Version</span>
                    <div className="flex gap-2">
                      <button
                        onClick={applyEnhanced}
                        className="flex items-center gap-1 px-3 py-1 bg-mc-accent text-mc-bg rounded text-xs font-medium hover:bg-mc-accent/90"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Apply Changes
                      </button>
                      <button
                        onClick={() => setShowEnhanced(false)}
                        className="p-1 hover:bg-mc-bg rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <pre className="p-4 text-sm font-mono bg-mc-bg overflow-auto max-h-96">
                    {analysis.enhanced_version}
                  </pre>
                </div>
              )}

              {!showEnhanced && !isAnalyzing && (
                <div className="text-center py-12 text-mc-text-secondary border border-dashed border-mc-border rounded-lg">
                  <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Click "Auto-Enhance" to generate an improved version</p>
                  <p className="text-sm mt-1">Your prompt will be analyzed and structurally improved</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-mc-border">
          <div className="flex gap-2">
            {form.content && (
              <button
                type="button"
                onClick={() => {
                  setForm({ ...form, title: prompt?.title || '', content: prompt?.content || '' });
                  setShowEnhanced(false);
                }}
                className="flex items-center gap-2 px-3 py-2 text-mc-text-secondary hover:text-mc-text rounded text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
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
              disabled={isSaving || !form.title || !form.content}
              className="flex items-center gap-2 px-4 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Prompt'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
