'use client';

import { MessageSquare, X, ArrowRight } from 'lucide-react';
import { ChatPanel } from './ChatPanel';

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChatModal({ isOpen, onClose }: ChatModalProps) {
  if (!isOpen) {
    // Floating button when closed
    return (
      <button
        onClick={() => {/* handl */}}
        className="fixed bottom-4 right-4 px-4 py-3 bg-mc-accent text-mc-bg rounded-full shadow-lg hover:bg-mc-accent/90 flex items-center gap-2 z-40 transition-transform hover:scale-105"
        onClickCapture={onClose}
      >
        <MessageSquare className="w-5 h-5" />
        <span className="font-medium">Chat</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 md:p-8">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-4xl h-[80vh] max-h-[800px] flex flex-col shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-3 border-b border-mc-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-mc-accent" />
            <h2 className="font-semibold">Chat</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-mc-text-secondary hover:text-mc-text flex items-center gap-1"
            >
              Close Chat
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-mc-bg-tertiary rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Chat Panel */}
        <div className="flex-1 overflow-hidden min-h-0">
          <ChatPanel />
        </div>
      </div>
    </div>
  );
}
