'use client';

import { useState, useCallback, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader2 } from 'lucide-react';

interface VoiceButtonProps {
  onVoiceCommand?: (text: string) => void;
  className?: string;
}

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export function VoiceButton({ onVoiceCommand, className = '' }: VoiceButtonProps) {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [recognition, setRecognition] = useState<any | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setSupported(false);
      return;
    }
    
    const rec = new SpeechRecognitionAPI();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    
    rec.onstart = () => setState('listening');
    
    rec.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setState('processing');
      onVoiceCommand?.(transcript);
    };
    
    rec.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setError(event.error);
      setState('error');
      setTimeout(() => setState('idle'), 2000);
    };
    
    rec.onend = () => {
      setState('idle');
    };
    
    setRecognition(rec);
  }, [onVoiceCommand]);

  const toggleListening = useCallback(() => {
    if (!recognition) return;
    
    if (state === 'listening') {
      recognition.stop();
    } else {
      setError(null);
      try {
        recognition.start();
      } catch (err) {
        console.error('Failed to start recognition:', err);
      }
    }
  }, [recognition, state]);

  if (!supported) {
    return (
      <button
        disabled
        className={`p-2 rounded-full text-mc-text-secondary opacity-50 cursor-not-allowed ${className}`}
        title="Speech recognition not supported"
      >
        <MicOff className="w-5 h-5" />
      </button>
    );
  }

  const getIcon = () => {
    switch (state) {
      case 'listening':
        return <Mic className="w-5 h-5 animate-pulse text-red-500" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 animate-spin text-mc-accent" />;
      case 'speaking':
        return <Volume2 className="w-5 h-5 text-green-500" />;
      case 'error':
        return <VolumeX className="w-5 h-5 text-red-500" />;
      default:
        return <Mic className="w-5 h-5" />;
    }
  };

  const getTooltip = () => {
    switch (state) {
      case 'listening':
        return 'Listening... Click to stop';
      case 'processing':
        return 'Processing...';
      case 'speaking':
        return 'Speaking...';
      case 'error':
        return `Error: ${error}`;
      default:
        return 'Click to speak command';
    }
  };

  return (
    <button
      onClick={toggleListening}
      className={`relative p-2 rounded-full transition-all ${
        state === 'listening'
          ? 'bg-red-500/20 text-red-500 ring-2 ring-red-500 animate-pulse'
          : state === 'processing'
          ? 'bg-mc-accent/20 text-mc-accent'
          : 'hover:bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-accent'
      } ${className}`}
      title={getTooltip()}
    >
      {getIcon()}
      
      {state === 'listening' && (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
      )}
    </button>
  );
}
