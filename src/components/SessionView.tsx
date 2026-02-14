'use client';

import { useEffect, useRef, useState, useCallback, KeyboardEvent } from 'react';
import { ChevronLeft, Send, Loader2, Circle, CheckCircle, XCircle, ArrowDown } from 'lucide-react';
import { useSessionHistory } from '@/hooks/useSessionHistory';

interface SessionViewProps {
  sessionId: string;
  sessionStatus: string;
  agentName?: string;
  agentEmoji?: string;
  onClose?: () => void;
}

export function SessionView({ sessionId, sessionStatus, agentName, agentEmoji, onClose }: SessionViewProps) {
  const isActive = sessionStatus === 'active';
  const { messages, isLoading, error, sendMessage, isSending } = useSessionHistory(sessionId, {
    pollInterval: 3000,
    enabled: true,
  });

  const [input, setInput] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevMessageCountRef = useRef(0);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (autoScroll && messages.length > prevMessageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
    setAutoScroll(atBottom);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setAutoScroll(true);
  };

  const handleSend = async () => {
    if (!input.trim() || isSending) return;
    const msg = input;
    setInput('');
    await sendMessage(msg);
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-grow textarea
  const handleInputChange = (value: string) => {
    setInput(value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const maxHeight = 4 * 24; // ~4 rows
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, maxHeight) + 'px';
    }
  };

  const getStatusBadge = () => {
    switch (sessionStatus) {
      case 'active':
        return (
          <span className="flex items-center gap-1.5 text-xs text-green-500">
            <Circle className="w-3 h-3 fill-current animate-pulse" />
            Active
          </span>
        );
      case 'completed':
        return (
          <span className="flex items-center gap-1.5 text-xs text-mc-accent">
            <CheckCircle className="w-3 h-3" />
            Completed
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1.5 text-xs text-red-500">
            <XCircle className="w-3 h-3" />
            Failed
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 text-xs text-mc-text-secondary">
            <Circle className="w-3 h-3" />
            {sessionStatus}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-mc-border flex-shrink-0">
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-mc-bg-tertiary rounded transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-mc-text-secondary" />
          </button>
        )}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {agentEmoji ? (
            <span className="text-xl flex-shrink-0">{agentEmoji}</span>
          ) : (
            <span className="text-xl flex-shrink-0">🤖</span>
          )}
          <span className="font-medium text-mc-text truncate">
            {agentName || 'Agent Session'}
          </span>
          {getStatusBadge()}
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 relative"
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-mc-text-secondary">
            <Loader2 className="w-6 h-6 animate-spin mb-2" />
            Loading conversation...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-mc-accent-red">
            <p className="text-sm">{error}</p>
            <p className="text-xs text-mc-text-secondary mt-1">Will retry automatically...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-mc-text-secondary">
            <span className="text-3xl mb-2">💬</span>
            <p className="text-sm">No messages yet</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            if (msg.role === 'system') {
              return (
                <div key={i} className="flex justify-center">
                  <p className="text-xs text-mc-text-secondary italic px-3 py-1 bg-mc-bg rounded-full max-w-[80%] text-center">
                    {msg.content}
                  </p>
                </div>
              );
            }

            const isAssistant = msg.role === 'assistant';
            return (
              <div key={i} className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
                  isAssistant
                    ? 'bg-mc-bg-tertiary text-mc-text'
                    : 'bg-mc-accent/10 text-mc-text'
                }`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-medium text-mc-text-secondary">
                      {isAssistant ? (agentEmoji ? `${agentEmoji} ${agentName || 'Agent'}` : `🤖 ${agentName || 'Agent'}`) : '🎛️ Mission Control'}
                    </span>
                    {msg.timestamp && (
                      <span className="text-xs text-mc-text-secondary opacity-60">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {!autoScroll && messages.length > 0 && (
        <div className="absolute bottom-20 right-6">
          <button
            onClick={scrollToBottom}
            className="p-2 bg-mc-bg-secondary border border-mc-border rounded-full shadow-lg hover:bg-mc-bg-tertiary transition-colors"
            title="Scroll to bottom"
          >
            <ArrowDown className="w-4 h-4 text-mc-text-secondary" />
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="flex-shrink-0 border-t border-mc-border px-4 py-3">
        {isActive ? (
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message... (Enter to send, Shift+Enter for newline)"
              rows={1}
              disabled={isSending}
              className="flex-1 bg-mc-bg border border-mc-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-mc-accent disabled:opacity-50 placeholder:text-mc-text-secondary"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              className="p-2 bg-mc-accent text-white rounded-lg hover:bg-mc-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              title="Send message"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        ) : (
          <div className="text-center py-1">
            <p className="text-xs text-mc-text-secondary">
              This session has {sessionStatus === 'completed' ? 'completed' : 'ended'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
