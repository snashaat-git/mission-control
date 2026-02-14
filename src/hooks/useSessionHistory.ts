'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { OpenClawHistoryMessage } from '@/lib/types';

interface UseSessionHistoryOptions {
  pollInterval?: number;
  enabled?: boolean;
}

export function useSessionHistory(
  sessionId: string | null,
  options: UseSessionHistoryOptions = {}
) {
  const { pollInterval = 3000, enabled = true } = options;

  const [messages, setMessages] = useState<OpenClawHistoryMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevCountRef = useRef(0);

  const fetchHistory = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/openclaw/sessions/${sessionId}/history`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      // Handle both array and nested { messages: [...] } formats
      const raw = data.history;
      const history: OpenClawHistoryMessage[] = Array.isArray(raw) ? raw : (raw?.messages || []);
      setMessages(history);
      setError(null);

      // Track if new messages arrived (for auto-scroll consumers)
      prevCountRef.current = history.length;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch history');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Initial fetch + polling
  useEffect(() => {
    if (!sessionId || !enabled) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchHistory();

    intervalRef.current = setInterval(fetchHistory, pollInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId, enabled, pollInterval, fetchHistory]);

  const sendMessage = useCallback(async (content: string) => {
    if (!sessionId || !content.trim()) return;
    setIsSending(true);
    try {
      const res = await fetch(`/api/openclaw/sessions/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send message');
      }
      // Immediately refresh to show the sent message
      await fetchHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  }, [sessionId, fetchHistory]);

  return { messages, isLoading, error, sendMessage, isSending, refresh: fetchHistory };
}
