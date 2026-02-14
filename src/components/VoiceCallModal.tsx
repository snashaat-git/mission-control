'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Phone, PhoneOff, Send, Loader2, Clock } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { useToast } from '@/hooks/useToast';
import type { VoiceCall } from '@/lib/types';

interface VoiceCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefillAgentId?: string;
}

type CallPhase = 'idle' | 'connecting' | 'active' | 'ended';

export function VoiceCallModal({ isOpen, onClose, prefillAgentId }: VoiceCallModalProps) {
  const { agents, activeCall, setActiveCall, addVoiceCall, updateVoiceCall } = useMissionControl();
  const { success: showSuccess, error: showError } = useToast();

  const [phase, setPhase] = useState<CallPhase>('idle');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [agentId, setAgentId] = useState(prefillAgentId || '');
  const [message, setMessage] = useState('');
  const [speakInput, setSpeakInput] = useState('');
  const [transcript, setTranscript] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      if (activeCall && (activeCall.status === 'active' || activeCall.status === 'initiating')) {
        setPhase(activeCall.status === 'active' ? 'active' : 'connecting');
        setPhoneNumber(activeCall.phone_number);
        setTranscript(activeCall.transcript || '');
      } else {
        setPhase('idle');
        setPhoneNumber('');
        setMessage('');
        setSpeakInput('');
        setTranscript('');
        setDurationSeconds(0);
      }
      if (prefillAgentId) setAgentId(prefillAgentId);
    }
  }, [isOpen, prefillAgentId, activeCall]);

  // Duration timer
  useEffect(() => {
    if (phase === 'active') {
      timerRef.current = setInterval(() => {
        setDurationSeconds((d) => d + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  // Poll call status during active/connecting
  const pollStatus = useCallback(async () => {
    if (!activeCall?.call_id) return;
    try {
      const res = await fetch(`/api/voicecall/calls/${activeCall.call_id}/status`);
      if (res.ok) {
        const data: VoiceCall = await res.json();
        updateVoiceCall(data);
        if (data.transcript) setTranscript(data.transcript);

        if (data.status === 'active' && phase === 'connecting') {
          setPhase('active');
        } else if (data.status === 'ended' || data.status === 'failed') {
          setPhase('ended');
          setDurationSeconds(data.duration_seconds);
          setActiveCall(null);
        }
      }
    } catch {
      // Ignore polling errors
    }
  }, [activeCall?.call_id, phase, updateVoiceCall, setActiveCall]);

  useEffect(() => {
    if (phase === 'connecting' || phase === 'active') {
      pollRef.current = setInterval(pollStatus, 3000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, pollStatus]);

  const handleInitiateCall = async () => {
    if (!phoneNumber.trim() || !message.trim()) return;

    setPhase('connecting');
    try {
      const res = await fetch('/api/voicecall/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agentId || undefined,
          phoneNumber: phoneNumber.trim(),
          message: message.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to initiate call');
      }

      const call: VoiceCall = await res.json();
      addVoiceCall(call);
      setActiveCall(call);
      showSuccess('Call initiated');
    } catch (error) {
      setPhase('idle');
      showError(error instanceof Error ? error.message : 'Failed to initiate call');
    }
  };

  const handleSendMessage = async () => {
    if (!speakInput.trim() || !activeCall?.call_id) return;

    const msg = speakInput.trim();
    setSpeakInput('');

    try {
      const res = await fetch(`/api/voicecall/calls/${activeCall.call_id}/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send message');
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to send');
    }
  };

  const handleEndCall = async () => {
    if (!activeCall?.call_id) return;

    try {
      const res = await fetch(`/api/voicecall/calls/${activeCall.call_id}/end`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to end call');
      }

      const result = await res.json();
      setPhase('ended');
      setDurationSeconds(result.duration);
      setActiveCall(null);
      showSuccess('Call ended');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to end call');
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voicecall-title"
    >
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-lg max-h-[95vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-mc-border">
          <div className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-mc-accent" />
            <h2 id="voicecall-title" className="text-lg font-semibold text-mc-text">
              {phase === 'idle' ? 'New Call' : phase === 'connecting' ? 'Connecting...' : phase === 'active' ? 'Call Active' : 'Call Ended'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {(phase === 'active' || phase === 'connecting') && (
              <span className="flex items-center gap-1 text-sm text-mc-accent-green font-mono">
                <Clock className="w-3.5 h-3.5" />
                {formatDuration(durationSeconds)}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1 hover:bg-mc-bg-tertiary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mc-accent"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-mc-text-secondary" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {phase === 'idle' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-mc-text mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+1 555 000 1234"
                  className="w-full px-3 py-2 bg-mc-bg border border-mc-border rounded text-mc-text focus:border-mc-accent focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-mc-text mb-1">Agent (optional)</label>
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="w-full px-3 py-2 bg-mc-bg border border-mc-border rounded text-mc-text focus:border-mc-accent focus:outline-none"
                >
                  <option value="">No agent (direct call)</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.avatar_emoji} {a.name} — {a.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-mc-text mb-1">Opening Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Hello! How can I help you today?"
                  rows={3}
                  className="w-full px-3 py-2 bg-mc-bg border border-mc-border rounded text-mc-text focus:border-mc-accent focus:outline-none resize-none"
                />
              </div>
            </div>
          )}

          {phase === 'connecting' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-16 h-16 rounded-full bg-mc-accent/20 flex items-center justify-center animate-pulse">
                <Phone className="w-8 h-8 text-mc-accent" />
              </div>
              <p className="text-mc-text-secondary text-sm">Calling {phoneNumber}...</p>
              <Loader2 className="w-5 h-5 text-mc-accent animate-spin" />
            </div>
          )}

          {phase === 'active' && (
            <div className="space-y-4">
              <div className="text-center text-sm text-mc-text-secondary mb-2">
                Connected to {phoneNumber}
              </div>

              {/* Live transcript */}
              <div className="bg-mc-bg rounded border border-mc-border p-3 min-h-[120px] max-h-[200px] overflow-y-auto">
                <p className="text-xs text-mc-text-secondary uppercase mb-2">Live Transcript</p>
                {transcript ? (
                  <p className="text-sm text-mc-text whitespace-pre-wrap">{transcript}</p>
                ) : (
                  <p className="text-sm text-mc-text-secondary italic">Waiting for speech...</p>
                )}
              </div>

              {/* Send message during call */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={speakInput}
                  onChange={(e) => setSpeakInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type a message to speak..."
                  className="flex-1 px-3 py-2 bg-mc-bg border border-mc-border rounded text-mc-text text-sm focus:border-mc-accent focus:outline-none"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!speakInput.trim()}
                  className="px-3 py-2 bg-mc-accent text-mc-bg rounded hover:bg-mc-accent/90 disabled:opacity-50"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {phase === 'ended' && (
            <div className="space-y-4">
              <div className="text-center py-6">
                <div className="w-14 h-14 rounded-full bg-mc-bg-tertiary flex items-center justify-center mx-auto mb-3">
                  <PhoneOff className="w-7 h-7 text-mc-text-secondary" />
                </div>
                <p className="text-mc-text font-medium">Call Ended</p>
                <p className="text-sm text-mc-text-secondary mt-1">
                  Duration: {formatDuration(durationSeconds)} &middot; {phoneNumber}
                </p>
              </div>

              {transcript && (
                <div className="bg-mc-bg rounded border border-mc-border p-3">
                  <p className="text-xs text-mc-text-secondary uppercase mb-2">Transcript</p>
                  <p className="text-sm text-mc-text whitespace-pre-wrap">{transcript}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-mc-border">
          {phase === 'idle' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-mc-text-secondary hover:text-mc-text"
              >
                Cancel
              </button>
              <button
                onClick={handleInitiateCall}
                disabled={!phoneNumber.trim() || !message.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-mc-accent-green text-white rounded hover:bg-mc-accent-green/90 disabled:opacity-50 text-sm font-medium"
              >
                <Phone className="w-4 h-4" />
                Start Call
              </button>
            </>
          )}

          {(phase === 'connecting' || phase === 'active') && (
            <>
              <div />
              <button
                onClick={handleEndCall}
                className="flex items-center gap-2 px-4 py-2 bg-mc-accent-red text-white rounded hover:bg-mc-accent-red/90 text-sm font-medium"
              >
                <PhoneOff className="w-4 h-4" />
                End Call
              </button>
            </>
          )}

          {phase === 'ended' && (
            <>
              <div />
              <button
                onClick={onClose}
                className="px-4 py-2 bg-mc-bg-tertiary text-mc-text rounded hover:bg-mc-border text-sm"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
