'use client';

import { useState } from 'react';
import { useMissionControl } from '@/lib/store';
import { TASK_TEMPLATES, formatTemplateDefaults, calculateDueDate, type TaskTemplate } from '@/lib/templates';
import type { TaskPriority, TaskStatus } from '@/lib/types';
import { FileText, X, Sparkles, ArrowRight } from 'lucide-react';

interface TemplatePickerProps {
  onSelect: (template: TaskTemplate, replacements: Record<string, string>) => void;
  onClose: () => void;
  onSkip: () => void;
}

export function TemplatePicker({ onSelect, onClose, onSkip }: TemplatePickerProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [replacements, setReplacements] = useState<Record<string, string>>({});

  const handleSelect = (template: TaskTemplate) => {
    // Extract placeholders from template
    const placeholders = extractPlaceholders(template);
    
    if (placeholders.length === 0) {
      // No placeholders - use template as-is
      onSelect(template, {});
    } else {
      setSelectedTemplate(template);
      // Initialize empty replacements
      const initial: Record<string, string> = {};
      placeholders.forEach((p) => (initial[p] = ''));
      setReplacements(initial);
    }
  };

  const handleConfirm = () => {
    if (selectedTemplate) {
      onSelect(selectedTemplate, replacements);
    }
  };

  // Extract placeholders like [Project Name] from template
  const extractPlaceholders = (template: TaskTemplate): string[] => {
    const text = template.defaults.title + ' ' + template.defaults.description;
    const matches = text.match(/\[([^\]]+)\]/g) || [];
    return [...new Set(matches.map((m) => m.slice(1, -1)))];
  };

  const placeholders = selectedTemplate ? extractPlaceholders(selectedTemplate) : [];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-mc-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-mc-accent-yellow" />
            <h2 className="text-lg font-semibold">Choose a Template</h2>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedTemplate ? (
            // Template Grid
            <div className="grid grid-cols-2 gap-3">
              {TASK_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
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
            // Placeholder Form
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-mc-border">
                <span className="text-2xl">{selectedTemplate.icon}</span>
                <div>
                  <h3 className="font-medium">{selectedTemplate.name}</h3>
                  <p className="text-sm text-mc-text-secondary">Fill in the details</p>
                </div>
              </div>

              {placeholders.map((placeholder) => (
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
                    autoFocus={placeholder === placeholders[0]}
                  />
                </div>
              ))}

              <div className="bg-mc-bg-tertiary rounded p-3 text-sm">
                <p className="text-mc-text-secondary mb-2">Preview:</p>
                <p className="font-medium">
                  {formatTemplateDefaults(selectedTemplate, replacements).title}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between p-4 border-t border-mc-border">
          <button
            onClick={() => {
              setSelectedTemplate(null);
              setReplacements({});
            }}
            className={`px-4 py-2 text-sm text-mc-text-secondary hover:text-mc-text ${
              selectedTemplate ? '' : 'invisible'
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
                onClick={handleConfirm}
                disabled={placeholders.some((p) => !replacements[p]?.trim())}
                className="flex items-center gap-2 px-4 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                Create Task
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
