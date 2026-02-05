'use client';

import { useState, useCallback, useRef } from 'react';
import { Mic, X, Loader2, Volume2, Command, Sparkles } from 'lucide-react';
import { VoiceButton } from './VoiceButton';

interface VoiceInterfaceProps {
  onCommand?: (result: { action: string; data?: any }) => void;
}

export function VoiceInterface({ onCommand }: VoiceInterfaceProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'listening' | 'processing' | 'error'>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleVoiceCommand = useCallback(async (text: string) => {
    setState('processing');
    setTranscript(text);
    setError(null);

    try {
      // Send to voice command API
      const res = await fetch('/api/voice/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        throw new Error('Command processing failed');
      }

      const data = await res.json();
      
      setResponse(data.result.message);
      setState('idle');
      
      // Play audio response if available
      if (data.audioUrl) {
        audioRef.current = new Audio(data.audioUrl);
        await audioRef.current.play();
      }

      // Notify parent component
      if (data.result.action && data.result.action !== 'UNKNOWN') {
        onCommand?.({
          action: data.result.action,
          data: data.result.data,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command failed');
      setState('idle');
    }
  }, [onCommand]);

  const examples = [
    'Create task: Landing Page',
    'Show my inbox',
    'Mark task as done',
    'What\'s the priority?',
  ];

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-4 py-3 bg-mc-accent text-white rounded-full shadow-lg shadow-mc-accent/30 hover:bg-mc-accent/90 transition-all hover:scale-105"
        >
          <Mic className="w-5 h-5" />
          <span className="font-medium">Voice Control</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-mc-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-mc-accent/20 flex items-center justify-center">
              <Command className="w-4 h-4 text-mc-accent" />
            </div>
            <span className="font-semibold">Voice Assistant</span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-mc-bg-tertiary rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Main voice button */}
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-mc-accent/20 to-mc-accent/5 border-2 border-mc-accent/30 flex items-center justify-center mb-4">
              <VoiceButton
                onVoiceCommand={handleVoiceCommand}
              />
            </div>
            
            <p className="text-sm text-mc-text-secondary text-center">
              {state === 'listening' ? 'Listening...' : 
               state === 'processing' ? 'Processing...' : 
               'Tap microphone to speak'}
            </p>
          </div>

          {/* Transcript */}
          {transcript && (
            <div className="bg-mc-bg-tertiary/50 rounded-xl p-4">
              <p className="text-sm text-mc-text-secondary mb-1">You said:</p>
              <p className="font-medium">{transcript}</p>
            </div>
          )}

          {/* Response */}
          {response && (
            <div className="bg-mc-accent/10 border border-mc-accent/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Volume2 className="w-4 h-4 text-mc-accent" />
                <p className="text-sm text-mc-accent">Response:</p>
              </div>
              <p className="font-medium">{response}</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Examples */}
          <div>
            <p className="text-xs text-mc-text-secondary mb-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Try saying:
            </p>
            <div className="flex flex-wrap gap-2">
              {examples.map((example) => (
                <button
                  key={example}
                  onClick={() => {
                    setTranscript(example);
                    handleVoiceCommand(example);
                  }}
                  className="px-3 py-1.5 bg-mc-bg-tertiary hover:bg-mc-bg border border-mc-border/50 rounded-full text-xs text-mc-text-secondary hover:text-mc-text transition-colors"
                >
                  "{example}"
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
