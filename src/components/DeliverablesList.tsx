/**
 * DeliverablesList Component
 * Displays deliverables (files, URLs, artifacts) for a task
 */

'use client';

import { useEffect, useState } from 'react';
import { FileText, Link as LinkIcon, Package, ExternalLink, Eye, RefreshCcw } from 'lucide-react';
import { debug } from '@/lib/debug';
import { useToast } from '@/hooks/useToast';
import type { TaskDeliverable } from '@/lib/types';

interface DeliverablesListProps {
  taskId: string;
}

export function DeliverablesList({ taskId }: DeliverablesListProps) {
  const { success, error: showError, warning } = useToast();
  const [deliverables, setDeliverables] = useState<TaskDeliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    setLoading(true);
    setDeliverables([]); // Clear previous task's deliverables
    loadDeliverables();
  }, [taskId]);

  const loadDeliverables = async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/deliverables`);
      if (res.ok) {
        const data = await res.json();
        // Some endpoints return an array, others return { deliverables: [...] }
        const list = Array.isArray(data) ? data : (Array.isArray((data as any)?.deliverables) ? (data as any).deliverables : []);
        setDeliverables(list);
      }
    } catch (error) {
      console.error('Failed to load deliverables:', error);
    } finally {
      setLoading(false);
    }
  };

  const scanDeliverables = async () => {
    setScanning(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/deliverables/scan`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Scan failed');
      }
      await loadDeliverables();
    } catch (error) {
      console.error('Failed to scan deliverables:', error);
      showError(error instanceof Error ? error.message : 'Failed to scan deliverables');
    } finally {
      setScanning(false);
    }
  };

  const getDeliverableIcon = (type: string) => {
    switch (type) {
      case 'file':
        return <FileText className="w-5 h-5" />;
      case 'url':
        return <LinkIcon className="w-5 h-5" />;
      case 'artifact':
        return <Package className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  const handleOpen = async (deliverable: TaskDeliverable) => {
    // URLs open directly in new tab
    if (deliverable.deliverable_type === 'url' && deliverable.path) {
      window.open(deliverable.path, '_blank');
      return;
    }

    // Files - try to open in Finder
    if (deliverable.path) {
      try {
        debug.file('Opening file in Finder', { path: deliverable.path });
        const res = await fetch('/api/files/reveal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: deliverable.path }),
        });

        if (res.ok) {
          debug.file('Opened in Finder successfully');
          return;
        }

        const error = await res.json();
        debug.file('Failed to open', error);

        if (res.status === 404) {
          warning(`File not found: ${deliverable.path}`);
        } else if (res.status === 403) {
          showError(`Cannot open: path is outside allowed directories`);
        } else {
          throw new Error(error.error || 'Unknown error');
        }
      } catch (error) {
        console.error('Failed to open file:', error);
        // Fallback: copy path to clipboard
        try {
          await navigator.clipboard.writeText(deliverable.path);
          warning(`Could not open Finder. Path copied to clipboard.`);
        } catch {
          warning(`File path: ${deliverable.path}`);
        }
      }
    }
  };

  const handlePreview = (deliverable: TaskDeliverable) => {
    if (deliverable.path) {
      debug.file('Opening preview', { path: deliverable.path });
      window.open(`/api/files/preview?path=${encodeURIComponent(deliverable.path)}`, '_blank');
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-mc-text-secondary">Loading deliverables...</div>
      </div>
    );
  }

  if (deliverables.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <button
            onClick={scanDeliverables}
            disabled={scanning}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-mc-bg-tertiary border border-mc-border rounded hover:border-mc-accent disabled:opacity-50"
            title="Scan the task output directory and register any files as deliverables"
          >
            <RefreshCcw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning…' : 'Scan deliverables'}
          </button>
        </div>

        <div className="flex flex-col items-center justify-center py-8 text-mc-text-secondary">
          <div className="text-4xl mb-2">📦</div>
          <p>No deliverables yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={scanDeliverables}
          disabled={scanning}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-mc-bg-tertiary border border-mc-border rounded hover:border-mc-accent disabled:opacity-50"
          title="Scan the task output directory and register any files as deliverables"
        >
          <RefreshCcw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning…' : 'Scan deliverables'}
        </button>
      </div>
      {deliverables.map((deliverable) => (
        <div
          key={deliverable.id}
          className="flex gap-3 p-3 bg-mc-bg rounded-lg border border-mc-border hover:border-mc-accent transition-colors"
        >
          {/* Icon */}
          <div className="flex-shrink-0 text-mc-accent">
            {getDeliverableIcon(deliverable.deliverable_type)}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title */}
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-medium text-mc-text">{deliverable.title}</h4>
              <div className="flex items-center gap-1">
                {/* Preview button for HTML files */}
                {deliverable.deliverable_type === 'file' && deliverable.path?.endsWith('.html') && (
                  <button
                    onClick={() => handlePreview(deliverable)}
                    className="flex-shrink-0 p-1 hover:bg-mc-bg-tertiary rounded text-mc-accent-cyan"
                    title="Preview in browser"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                )}
                {/* Open/Reveal button */}
                {deliverable.path && (
                  <button
                    onClick={() => handleOpen(deliverable)}
                    className="flex-shrink-0 p-1 hover:bg-mc-bg-tertiary rounded text-mc-accent"
                    title={deliverable.deliverable_type === 'url' ? 'Open URL' : 'Reveal in Finder'}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Description */}
            {deliverable.description && (
              <p className="text-sm text-mc-text-secondary mt-1">
                {deliverable.description}
              </p>
            )}

            {/* Path */}
            {deliverable.path && (
              <div className="mt-2 p-2 bg-mc-bg-tertiary rounded text-xs text-mc-text-secondary font-mono break-all">
                {deliverable.path}
              </div>
            )}

            {/* Metadata */}
            <div className="flex items-center gap-4 mt-2 text-xs text-mc-text-secondary">
              <span className="capitalize">{deliverable.deliverable_type}</span>
              <span>•</span>
              <span>{formatTimestamp(deliverable.created_at)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
