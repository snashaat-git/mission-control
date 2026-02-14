'use client';

import { useState } from 'react';
import { useMissionControl } from '@/lib/store';
import {
  TASK_TEMPLATES,
  WORKFLOW_TEMPLATES,
  formatTemplateDefaults,
  calculateDueDate,
  type TaskTemplate,
  type WorkflowTemplate,
} from '@/lib/templates';
import type { TaskPriority, TaskStatus, Task } from '@/lib/types';
import { FileText, X, Sparkles, ArrowRight, GitBranch, Loader2 } from 'lucide-react';

type Tab = 'templates' | 'workflows';

interface TemplatePickerProps {
  onSelect: (template: TaskTemplate, replacements: Record<string, string>) => void;
  onClose: () => void;
  onSkip: () => void;
}

export function TemplatePicker({ onSelect, onClose, onSkip }: TemplatePickerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('templates');
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowTemplate | null>(null);
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const [isCreatingWorkflow, setIsCreatingWorkflow] = useState(false);
  const { addTask } = useMissionControl();

  const handleSelectTemplate = (template: TaskTemplate) => {
    const placeholders = extractTemplatePlaceholders(template);
    if (placeholders.length === 0) {
      onSelect(template, {});
    } else {
      setSelectedTemplate(template);
      const initial: Record<string, string> = {};
      placeholders.forEach((p) => (initial[p] = ''));
      setReplacements(initial);
    }
  };

  const handleConfirmTemplate = () => {
    if (selectedTemplate) {
      onSelect(selectedTemplate, replacements);
    }
  };

  const handleSelectWorkflow = (workflow: WorkflowTemplate) => {
    const placeholders = extractWorkflowPlaceholders(workflow);
    setSelectedWorkflow(workflow);
    const initial: Record<string, string> = {};
    placeholders.forEach((p) => (initial[p] = ''));
    setReplacements(initial);
  };

  const handleConfirmWorkflow = async () => {
    if (!selectedWorkflow) return;
    setIsCreatingWorkflow(true);
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: selectedWorkflow.id,
          replacements,
        }),
      });
      if (res.ok) {
        const tasks: Task[] = await res.json();
        tasks.forEach((t) => addTask(t));
        onClose();
      }
    } catch (err) {
      console.error('Failed to create workflow:', err);
    } finally {
      setIsCreatingWorkflow(false);
    }
  };

  const extractTemplatePlaceholders = (template: TaskTemplate): string[] => {
    const text = template.defaults.title + ' ' + template.defaults.description;
    const matches = text.match(/\[([^\]]+)\]/g) || [];
    return [...new Set(matches.map((m) => m.slice(1, -1)))];
  };

  const extractWorkflowPlaceholders = (workflow: WorkflowTemplate): string[] => {
    const allText = workflow.steps
      .map((s) => s.defaults.title + ' ' + s.defaults.description)
      .join(' ');
    const matches = allText.match(/\[([^\]]+)\]/g) || [];
    return [...new Set(matches.map((m) => m.slice(1, -1)))];
  };

  const handleBack = () => {
    setSelectedTemplate(null);
    setSelectedWorkflow(null);
    setReplacements({});
  };

  const isInForm = selectedTemplate || selectedWorkflow;
  const currentPlaceholders = selectedTemplate
    ? extractTemplatePlaceholders(selectedTemplate)
    : selectedWorkflow
    ? extractWorkflowPlaceholders(selectedWorkflow)
    : [];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="template-picker-title">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-mc-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-mc-accent-yellow" />
            <h2 id="template-picker-title" className="text-lg font-semibold">
              {isInForm ? (selectedWorkflow ? 'Create Workflow' : 'Create from Template') : 'Choose a Template'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onSkip}
              className="text-sm text-mc-text-secondary hover:text-mc-accent flex items-center gap-1"
            >
              Blank Task
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-mc-bg-tertiary rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs (only shown when not in form view) */}
        {!isInForm && (
          <div className="flex border-b border-mc-border">
            <button
              onClick={() => setActiveTab('templates')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'templates'
                  ? 'text-mc-accent border-b-2 border-mc-accent'
                  : 'text-mc-text-secondary hover:text-mc-text'
              }`}
            >
              Templates
            </button>
            <button
              onClick={() => setActiveTab('workflows')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'workflows'
                  ? 'text-mc-accent border-b-2 border-mc-accent'
                  : 'text-mc-text-secondary hover:text-mc-text'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Workflows
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isInForm ? (
            // Placeholder Form (shared for templates and workflows)
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-mc-border">
                <span className="text-2xl">
                  {selectedTemplate?.icon || selectedWorkflow?.icon}
                </span>
                <div>
                  <h3 className="font-medium">
                    {selectedTemplate?.name || selectedWorkflow?.name}
                  </h3>
                  <p className="text-sm text-mc-text-secondary">
                    {selectedWorkflow
                      ? `${selectedWorkflow.steps.length} tasks will be created with dependencies`
                      : 'Fill in the details'}
                  </p>
                </div>
              </div>

              {currentPlaceholders.map((placeholder) => (
                <div key={placeholder}>
                  <label className="block text-sm font-medium mb-1">
                    {placeholder}
                  </label>
                  <input
                    type="text"
                    value={replacements[placeholder] || ''}
                    onChange={(e) =>
                      setReplacements({ ...replacements, [placeholder]: e.target.value })
                    }
                    placeholder={`Enter ${placeholder.toLowerCase()}...`}
                    className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
                    autoFocus={placeholder === currentPlaceholders[0]}
                  />
                </div>
              ))}

              {selectedTemplate && (
                <div className="bg-mc-bg-tertiary rounded p-3 text-sm">
                  <p className="text-mc-text-secondary mb-2">Preview:</p>
                  <p className="font-medium">
                    {formatTemplateDefaults(selectedTemplate, replacements).title}
                  </p>
                </div>
              )}

              {selectedWorkflow && (
                <div className="bg-mc-bg-tertiary rounded p-3 text-sm">
                  <p className="text-mc-text-secondary mb-2">Steps:</p>
                  <div className="space-y-2">
                    {selectedWorkflow.steps.map((step, i) => {
                      let title = step.defaults.title;
                      for (const [key, value] of Object.entries(replacements)) {
                        title = title.replaceAll(`[${key}]`, value || `[${key}]`);
                      }
                      const deps = step.dependsOnSteps.map(
                        (d) => selectedWorkflow.steps[d].stepLabel
                      );
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-mc-accent font-mono text-xs w-5">
                            {i + 1}.
                          </span>
                          <span className="font-medium">{title}</span>
                          {deps.length > 0 && (
                            <span className="text-xs text-mc-text-secondary">
                              (after {deps.join(', ')})
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'templates' ? (
            // Template Grid
            <div className="grid grid-cols-2 gap-3">
              {TASK_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSelectTemplate(template)}
                  className="flex flex-col items-start p-4 bg-mc-bg border border-mc-border rounded-lg hover:border-mc-accent hover:bg-mc-bg-tertiary/50 transition-all text-left group"
                >
                  <span className="text-2xl mb-2 group-hover:scale-110 transition-transform">
                    {template.icon}
                  </span>
                  <h3 className="font-medium text-mc-text mb-1">{template.name}</h3>
                  <p className="text-sm text-mc-text-secondary">{template.description}</p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    <span className="text-xs px-2 py-0.5 bg-mc-accent/20 text-mc-accent rounded">
                      {template.defaults.priority}
                    </span>
                    {template.defaults.suggested_due_hours && (
                      <span className="text-xs px-2 py-0.5 bg-mc-bg-tertiary text-mc-text-secondary rounded">
                        ~{template.defaults.suggested_due_hours}h
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            // Workflow Grid
            <div className="grid grid-cols-1 gap-3">
              {WORKFLOW_TEMPLATES.map((workflow) => (
                <button
                  key={workflow.id}
                  onClick={() => handleSelectWorkflow(workflow)}
                  className="flex flex-col items-start p-4 bg-mc-bg border border-mc-border rounded-lg hover:border-mc-accent hover:bg-mc-bg-tertiary/50 transition-all text-left group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl group-hover:scale-110 transition-transform">
                      {workflow.icon}
                    </span>
                    <div>
                      <h3 className="font-medium text-mc-text">{workflow.name}</h3>
                      <p className="text-sm text-mc-text-secondary">{workflow.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {workflow.steps.map((step, i) => (
                      <span key={i} className="flex items-center gap-1.5">
                        <span className="text-xs px-2 py-1 bg-mc-bg-tertiary text-mc-text-secondary rounded border border-mc-border">
                          {step.stepLabel}
                        </span>
                        {i < workflow.steps.length - 1 && (
                          <span className="text-mc-text-secondary text-xs">→</span>
                        )}
                      </span>
                    ))}
                    <span className="text-xs px-2 py-0.5 bg-mc-accent/20 text-mc-accent rounded ml-2">
                      {workflow.steps.length} tasks
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between p-4 border-t border-mc-border">
          <button
            onClick={handleBack}
            className={`px-4 py-2 text-sm text-mc-text-secondary hover:text-mc-text ${
              isInForm ? '' : 'invisible'
            }`}
          >
            ← Back
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-mc-text-secondary hover:text-mc-text"
            >
              Cancel
            </button>
            {selectedTemplate && (
              <button
                onClick={handleConfirmTemplate}
                disabled={currentPlaceholders.some((p) => !replacements[p]?.trim())}
                className="flex items-center gap-2 px-4 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                Create Task
              </button>
            )}
            {selectedWorkflow && (
              <button
                onClick={handleConfirmWorkflow}
                disabled={
                  currentPlaceholders.some((p) => !replacements[p]?.trim()) ||
                  isCreatingWorkflow
                }
                className="flex items-center gap-2 px-4 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50"
              >
                {isCreatingWorkflow ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <GitBranch className="w-4 h-4" />
                )}
                Create {selectedWorkflow.steps.length} Tasks
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
