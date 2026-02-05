'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Send } from 'lucide-react';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onSubmit?: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function VoiceInput({ 
  onTranscript, 
  onSubmit, 
  placeholder = 'Speak or type...',
  disabled = false 
}: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [recognition, setRecognition] = useState<any | null>(null);
  const [supported, setSupported] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setSupported(false);
      return;
    }
    
    const rec = new SpeechRecognitionAPI();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    
    rec.onstart = () => {
      setIsListening(true);
      setInterimTranscript('');
    };
    
    rec.onresult = (event: any) => {
      let finalTranscript = '';
      let interim = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      
      if (finalTranscript) {
        setTranscript((prev) => {
          const newText = prev ? `${prev} ${finalTranscript}` : finalTranscript;
          onTranscript?.(newText);
          return newText;
        });
      }
      
      setInterimTranscript(interim);
    };
    
    rec.onerror = (event: any) => {
      console.error('Speech error:', event.error);
      if (event.error === 'not-allowed') {
        setSupported(false);
      }
    };
    
    rec.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };
    
    setRecognition(rec);
  }, [onTranscript]);

  const toggleListening = useCallback(() => {
    if (!recognition) return;
    
    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
    }
  }, [recognition, isListening]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (transcript.trim()) {
        onSubmit?.(transcript);
        setTranscript('');
      }
    }
  };
  
  if (!supported) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 bg-mc-bg border border-mc-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-mc-accent"
      />
    );
  }

  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isListening}
          className="w-full bg-mc-bg border border-mc-border rounded-lg pl-4 pr-10 py-2 text-sm focus:outline-none focus:border-mc-accent disabled:opacity-50"
        />
        
        {interimTranscript && (
          <span className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-mc-text-secondary italic">
            {interimTranscript}
          </span>
        )}
      </div>
      
      <button
        onClick={toggleListening}
        disabled={disabled}
        className={`p-2 rounded-lg transition-all ${
          isListening
            ? 'bg-red-500/20 text-red-500 animate-pulse'
            : 'hover:bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-accent'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={isListening ? 'Stop listening' : 'Start voice input'}
      >
        {isListening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      </button>
      
      <button
        onClick={() => {
          if (transcript.trim()) {
            onSubmit?.(transcript);
            setTranscript('');
          }
        }}
        disabled={disabled || !transcript.trim()}
        className="p-2 bg-mc-accent text-mc-bg rounded-lg hover:bg-mc-accent/90 disabled:opacity-50"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}
