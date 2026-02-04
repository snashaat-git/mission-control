'use client';

import { useEffect, useState } from 'react';
import { 
  Monitor, Image, Video, FileCode, ExternalLink, 
  RefreshCw, CheckCircle, AlertCircle, Clock, 
  Download, FolderOpen, Play
} from 'lucide-react';
import type { AntigravityTask, AntigravityArtifact } from '@/lib/types';

interface AntigravityMonitorProps {
  taskId: string;
  outputDir?: string;
}

export function AntigravityMonitor({ taskId, outputDir }: AntigravityMonitorProps) {
  const [agTask, setAgTask] = useState<AntigravityTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<AntigravityArtifact | null>(null);

  // Poll for updates
  useEffect(() => {
    fetchStatus();
    
    // Poll every 10s if task is active
    const interval = setInterval(() => {
      if (agTask?.status === 'in_progress' || agTask?.status === 'dispatched') {
        fetchStatus();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [taskId, agTask?.status]);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/agents/antigravity/status/${taskId}`);
      if (res.ok) {
        const data = await res.json();
        setAgTask(data);
      } else if (res.status === 404) {
        // No Antigravity task yet - normal for non-dispatched tasks
        setAgTask(null);
      }
    } catch (error) {
      console.error('Failed to fetch Antigravity status:', error);
    } finally {
      setLoading(false);
      setPolling(false);
    }
  };

  const dispatchToAntigravity = async () => {
    if (!confirm('Dispatch this task to Google Antigravity?\n\nThis will create a workspace and start monitoring for artifacts.')) {
      return;
    }

    setPolling(true);
    try {
      const res = await fetch('/api/agents/antigravity/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          prompt: 'Task dispatched from Mission Control',
          expected_artifacts: ['screenshot', 'recording', 'code'],
          output_dir: outputDir,
        }),
      });

      if (res.ok) {
        await fetchStatus();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to dispatch');
      }
    } catch (error) {
      alert('Failed to dispatch to Antigravity');
    } finally {
      setPolling(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'in_progress':
        return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'dispatched':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      default:
        return <Monitor className="w-5 h-5 text-mc-text-secondary" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'text-green-500 bg-green-500/10';
      case 'error':
        return 'text-red-500 bg-red-500/10';
      case 'in_progress':
        return 'text-blue-500 bg-blue-500/10';
      case 'dispatched':
        return 'text-yellow-500 bg-yellow-500/10';
      default:
        return 'text-mc-text-secondary bg-mc-bg-tertiary';
    }
  };

  const getArtifactIcon = (type: string) => {
    switch (type) {
      case 'screenshot':
        return <Image className="w-4 h-4" />;
      case 'recording':
        return <Video className="w-4 h-4" />;
      case 'code':
        return <FileCode className="w-4 h-4" />;
      default:
        return <FileCode className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2 text-mc-text-secondary">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading Antigravity status...
        </div>
      </div>
    );
  }

  // No Antigravity task yet - show dispatch option
  if (!agTask) {
    return (
      <div className="space-y-4">
        <div className="bg-mc-bg border border-dashed border-mc-border rounded-lg p-6 text-center">
          <Monitor className="w-12 h-12 mx-auto mb-3 text-mc-text-secondary opacity-50" />
          <h3 className="font-medium text-mc-text mb-1">Not Dispatched to Antigravity</h3>
          <p className="text-sm text-mc-text-secondary mb-4">
            This task has not been sent to Google Antigravity yet.
            <br />
            Dispatch for IDE context, visual verification, and artifacts.
          </p>
          <button
            onClick={dispatchToAntigravity}
            disabled={polling}
            className="flex items-center gap-2 px-4 py-2 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50 mx-auto"
          >
            {polling ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Dispatching...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Dispatch to Antigravity
              </>
            )}
          </button>
        </div>

        <div className="text-xs text-mc-text-secondary space-y-1">
          <p>💡 <strong>When to use Antigravity:</strong></p>
          <ul className="list-disc list-inside space-y-0.5 ml-2">
            <li>Multi-file coding projects</li>
            <li>UI work needing screenshot proof</li>
            <li>Browser testing & verification</li>
            <li>Complex implementations with iteration</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <div className={`p-4 rounded-lg ${getStatusColor(agTask.status)}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon(agTask.status)}
            <div>
              <div className="font-medium capitalize">
                {agTask.status.replace('_', ' ')}
              </div>
              <div className="text-sm opacity-75">
                Workspace: {agTask.workspace_name}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchStatus}
              disabled={polling}
              className="p-2 hover:bg-white/10 rounded"
              title="Refresh status"
            >
              <RefreshCw className={`w-4 h-4 ${polling ? 'animate-spin' : ''}`} />
            </button>
            {agTask.workspace_url && (
              <a
                href={agTask.workspace_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-2 bg-white/20 rounded text-sm font-medium hover:bg-white/30"
              >
                <ExternalLink className="w-4 h-4" />
                Open Workspace
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Progress */}
      {agTask.status !== 'complete' && agTask.status !== 'error' && (
        <div className="bg-mc-bg border border-mc-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Monitoring for artifacts...</span>
            <span className="text-xs text-mc-text-secondary">
              {agTask.artifacts?.length || 0} found
            </span>
          </div>
          <div className="w-full bg-mc-bg-tertiary rounded-full h-2">
            <div 
              className="bg-mc-accent h-2 rounded-full transition-all duration-500"
              style={{ 
                width: `${Math.min(100, (agTask.artifacts?.length || 0) * 20)}%` 
              }}
            />
          </div>
          <p className="text-xs text-mc-text-secondary mt-2">
            Polling every 10 seconds for new artifacts
          </p>
        </div>
      )}

      {/* Error Message */}
      {agTask.error_message && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-400 mb-1">
            <AlertCircle className="w-4 h-4" />
            <span className="font-medium">Error</span>
          </div>
          <p className="text-sm text-mc-text">{agTask.error_message}</p>
        </div>
      )}

      {/* Artifacts */}
      {agTask.artifacts && agTask.artifacts.length > 0 && (
        <div className="bg-mc-bg border border-mc-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-mc-border flex items-center justify-between">
            <h3 className="font-medium flex items-center gap-2">
              <Image className="w-4 h-4 text-mc-accent" />
              Artifacts ({agTask.artifacts.length})
            </h3>
            {outputDir && (
              <a
                href={`/api/files/browse?path=${encodeURIComponent(outputDir)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-mc-accent hover:underline"
              >
                <FolderOpen className="w-3 h-3" />
                View in output dir
              </a>
            )}
          </div>

          <div className="divide-y divide-mc-border">
            {agTask.artifacts.map((artifact, index) => (
              <div 
                key={index}
                className="flex items-center justify-between px-4 py-3 hover:bg-mc-bg-tertiary transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="text-mc-accent">
                    {getArtifactIcon(artifact.type)}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{artifact.name}</div>
                    <div className="text-xs text-mc-text-secondary capitalize">
                      {artifact.type}
                      {artifact.downloaded && ' • Synced to OpenClaw'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {artifact.local_path && (
                    <a
                      href={`/api/files${artifact.local_path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-mc-bg rounded"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                  {artifact.url && (
                    <a
                      href={artifact.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-mc-bg rounded"
                      title="View in Antigravity"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {(!agTask.artifacts || agTask.artifacts.length === 0) && agTask.status !== 'error' && (
        <div className="bg-mc-bg border border-dashed border-mc-border rounded-lg p-8 text-center">
          <Clock className="w-10 h-10 mx-auto mb-3 text-mc-text-secondary opacity-50" />
          <p className="text-mc-text-secondary">
            No artifacts yet. <br />
            <span className="text-sm">Antigravity is working...</span>
          </p>
        </div>
      )}

      {/* Expected Artifacts */}
      {agTask.expected_artifacts && agTask.expected_artifacts.length > 0 && (
        <div className="text-xs text-mc-text-secondary">
          <span className="font-medium">Expected: </span>
          {agTask.expected_artifacts.join(', ')}
        </div>
      )}
    </div>
  );
}
