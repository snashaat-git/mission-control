'use client';

import { useState, useEffect } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneOff, Clock, RefreshCw } from 'lucide-react';
import type { VoiceCall } from '@/lib/types';

interface CallHistoryProps {
  agentId?: string;
  limit?: number;
}

const STATUS_STYLES: Record<string, string> = {
  initiating: 'bg-mc-accent-yellow/20 text-mc-accent-yellow',
  active: 'bg-mc-accent-green/20 text-mc-accent-green',
  ended: 'bg-mc-bg-tertiary text-mc-text-secondary',
  failed: 'bg-mc-accent-red/20 text-mc-accent-red',
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CallHistory({ agentId, limit = 20 }: CallHistoryProps) {
  const [calls, setCalls] = useState<VoiceCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCall, setExpandedCall] = useState<string | null>(null);

  const loadCalls = async () => {
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (agentId) params.set('agentId', agentId);
      const res = await fetch(`/api/voicecall/calls?${params}`);
      if (res.ok) {
        setCalls(await res.json());
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalls();
    const interval = setInterval(loadCalls, 10000);
    return () => clearInterval(interval);
  }, [agentId]);

  if (loading) {
    return (
      <div className="p-4 text-center text-mc-text-secondary text-sm">
        Loading call history...
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="p-6 text-center">
        <Phone className="w-8 h-8 text-mc-text-secondary mx-auto mb-2 opacity-50" />
        <p className="text-sm text-mc-text-secondary">No calls yet</p>
        <p className="text-xs text-mc-text-secondary mt-1">
          Start a call using the phone button in the header
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium text-mc-text-secondary uppercase">Call History</span>
        <button
          onClick={loadCalls}
          className="p-1 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
          aria-label="Refresh call history"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {calls.map((call) => (
        <div key={call.id}>
          <button
            onClick={() => setExpandedCall(expandedCall === call.id ? null : call.id)}
            className="w-full text-left px-3 py-2 hover:bg-mc-bg-tertiary rounded transition-colors"
          >
            <div className="flex items-center gap-2">
              {call.direction === 'inbound' ? (
                <PhoneIncoming className="w-4 h-4 text-mc-accent-green flex-shrink-0" />
              ) : (
                <PhoneOutgoing className="w-4 h-4 text-mc-accent flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-mc-text truncate">{call.phone_number}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_STYLES[call.status] || ''}`}>
                    {call.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-mc-text-secondary mt-0.5">
                  {call.agent_emoji && <span>{call.agent_emoji} {call.agent_name}</span>}
                  <span>{formatTime(call.created_at)}</span>
                  {call.duration_seconds > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      {formatDuration(call.duration_seconds)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>

          {/* Expanded transcript */}
          {expandedCall === call.id && call.transcript && (
            <div className="mx-3 mb-2 p-2 bg-mc-bg rounded border border-mc-border">
              <p className="text-xs text-mc-text-secondary uppercase mb-1">Transcript</p>
              <p className="text-xs text-mc-text whitespace-pre-wrap">{call.transcript}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
