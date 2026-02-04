'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Send, Users, Plus, X, Zap, Search, Phone, Video, 
  MoreVertical, Smile, Paperclip, Mic, Check, CheckCheck,
  ChevronLeft, Edit3, Trash2, Archive, Bell, BellOff,
  Command, Sparkles, Bot, UserCircle2, Image as ImageIcon,
  FileText, Download, Play, Pause, Volume2
} from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { Message, Conversation, Agent, OpenClawHistoryMessage, OpenClawSession } from '@/lib/types';
import { formatDistanceToNow, format } from 'date-fns';

interface ChatTheme {
  bubbleRadius: string;
  spacing: 'compact' | 'normal' | 'spacious';
  showAvatars: boolean;
  showTimestamps: 'always' | 'hover' | 'grouped';
  fontSize: 'small' | 'normal' | 'large';
}

export function ChatPanel() {
  const {
    conversations,
    currentConversation,
    setCurrentConversation,
    messages,
    setMessages,
    addMessage,
    agents,
    addEvent,
    agentOpenClawSessions,
    setAgentOpenClawSession,
    openclawMessages,
    setOpenclawMessages,
  } = useMissionControl();

  const [newMessage, setNewMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedSender, setSelectedSender] = useState<string>('');
  const [showConversationList, setShowConversationList] = useState(true);
  const [showNewConvoModal, setShowNewConvoModal] = useState(false);
  const [isSendingToOpenClaw, setIsSendingToOpenClaw] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [chatTheme, setChatTheme] = useState<ChatTheme>({
    bubbleRadius: 'rounded-2xl',
    spacing: 'normal',
    showAvatars: true,
    showTimestamps: 'grouped',
    fontSize: 'normal'
  });
  const [isTyping, setIsTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Find if conversation has any OpenClaw-linked agent
  const getOpenClawLinkedAgent = useCallback(() => {
    if (!currentConversation?.participants) return null;
    for (const participant of currentConversation.participants) {
      const session = agentOpenClawSessions[participant.id];
      if (session) {
        return { agent: participant, session };
      }
    }
    return null;
  }, [currentConversation?.participants, agentOpenClawSessions]);

  // Load messages when conversation changes
  useEffect(() => {
    if (currentConversation) {
      fetchMessages(currentConversation.id);
      setShowConversationList(false);
    }
  }, [currentConversation?.id]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [newMessage]);

  // Load agent-to-session mappings
  useEffect(() => {
    const loadAgentSessions = async () => {
      try {
        const res = await fetch('/api/openclaw/agent-sessions');
        if (res.ok) {
          const { mapping } = await res.json();
          Object.entries(mapping).forEach(([agentId, session]) => {
            setAgentOpenClawSession(agentId, session as OpenClawSession);
          });
        }
      } catch (error) {
        console.error('[ChatPanel] Failed to load agent sessions:', error);
      }
    };
    loadAgentSessions();
  }, [setAgentOpenClawSession]);

  // Poll OpenClaw for messages
  useEffect(() => {
    const linkedAgent = getOpenClawLinkedAgent();

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (!linkedAgent || !currentConversation) {
      setOpenclawMessages([]);
      return;
    }

    const fetchOpenClawHistory = async () => {
      try {
        const res = await fetch(`/api/openclaw/sessions/${linkedAgent.session.openclaw_session_id}/history`);
        if (res.ok) {
          const data = await res.json();
          const historyArray = data.history?.messages || data.history || data || [];
          const history = historyArray as OpenClawHistoryMessage[];

          const convertedMessages: Message[] = history.map((msg, index) => {
            let textContent = '';
            if (typeof msg.content === 'string') {
              textContent = msg.content;
            } else if (Array.isArray(msg.content)) {
              textContent = (msg.content as any[])
                .filter((part: any) => part.type === 'text')
                .map((part: any) => part.text)
                .join('');
            }
            
            return {
              id: `openclaw-${index}-${msg.timestamp || Date.now()}`,
              conversation_id: currentConversation.id,
              sender_agent_id: msg.role === 'assistant' ? linkedAgent.agent.id : undefined,
              content: textContent,
              message_type: 'text',
              created_at: msg.timestamp || new Date().toISOString(),
              sender: msg.role === 'assistant' ? linkedAgent.agent : undefined,
              metadata: JSON.stringify({ source: 'openclaw', role: msg.role }),
            };
          });

          setOpenclawMessages(convertedMessages);
        }
      } catch (error) {
        console.error('Failed to fetch OpenClaw history:', error);
      }
    };

    fetchOpenClawHistory();
    pollIntervalRef.current = setInterval(fetchOpenClawHistory, 3000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [currentConversation?.id, getOpenClawLinkedAgent, setOpenclawMessages]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, openclawMessages, isTyping]);

  const fetchMessages = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      if (res.ok) {
        const msgs = await res.json();
        setMessages(msgs);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || !currentConversation) return;

    const linkedAgent = getOpenClawLinkedAgent();
    const messageContent = newMessage;
    setNewMessage('');
    setSelectedFile(null);
    setIsTyping(false);
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Simulate typing indicator for OpenClaw
    if (linkedAgent) {
      setIsTyping(true);
    }

    try {
      if (linkedAgent) {
        setIsSendingToOpenClaw(true);
        
        if (selectedFile) {
          const formData = new FormData();
          formData.append('file', selectedFile);
          if (messageContent) formData.append('message', messageContent);
          
          await fetch(`/api/openclaw/sessions/${linkedAgent.session.openclaw_session_id}/upload`, {
            method: 'POST',
            body: formData,
          });
        } else {
          await fetch(`/api/openclaw/sessions/${linkedAgent.session.openclaw_session_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: messageContent }),
          });
        }

        addEvent({
          id: crypto.randomUUID(),
          type: 'message_sent',
          agent_id: selectedSender,
          message: `Sent message to ${linkedAgent.agent.name} via OpenClaw`,
          created_at: new Date().toISOString(),
        });
      } else {
        if (!selectedSender) return;

        const tempMessage: Message = {
          id: crypto.randomUUID(),
          conversation_id: currentConversation.id,
          sender_agent_id: selectedSender,
          content: messageContent,
          message_type: 'text',
          created_at: new Date().toISOString(),
          sender: agents.find((a) => a.id === selectedSender),
        };

        addMessage(tempMessage);

        await fetch(`/api/conversations/${currentConversation.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender_agent_id: selectedSender,
            content: messageContent,
          }),
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSendingToOpenClaw(false);
      setTimeout(() => setIsTyping(false), 1000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const filteredConversations = conversations.filter(conv => 
    conv.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.participants?.some(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const linkedAgentInfo = getOpenClawLinkedAgent();
  const displayMessages = linkedAgentInfo ? openclawMessages : messages;

  if (showConversationList) {
    return (
      <ConversationList
        conversations={filteredConversations}
        onSelect={(conv) => setCurrentConversation(conv)}
        onNewConversation={() => setShowNewConvoModal(true)}
        showNewConvoModal={showNewConvoModal}
        setShowNewConvoModal={setShowNewConvoModal}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        showSearch={showSearch}
        setShowSearch={setShowSearch}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-mc-bg to-mc-bg-secondary">
      {/* Enhanced Chat Header */}
      <div className="p-4 border-b border-mc-border/50 backdrop-blur-sm bg-mc-bg/80 flex items-center gap-3">
        <button
          onClick={() => setShowConversationList(true)}
          className="p-2 hover:bg-mc-bg-tertiary/80 rounded-xl transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-mc-accent/20 to-mc-accent/5 flex items-center justify-center border border-mc-accent/20">
                {linkedAgentInfo ? (
                  <span className="text-2xl">{linkedAgentInfo.agent.avatar_emoji}</span>
                ) : (
                  <Users className="w-5 h-5 text-mc-accent" />
                )}
              </div>
              {linkedAgentInfo && (
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-mc-bg" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm truncate">
                  {currentConversation?.title || 'Conversation'}
                </h3>
                {linkedAgentInfo && (
                  <span className="flex items-center gap-1 text-xs bg-gradient-to-r from-green-500/20 to-emerald-500/10 text-green-400 px-2 py-0.5 rounded-full border border-green-500/20">
                    <Zap className="w-3 h-3" />
                    OpenClaw
                  </span>
                )}
              </div>
              <p className="text-xs text-mc-text-secondary truncate">
                {linkedAgentInfo ? 'Active now' : currentConversation?.participants?.map((p) => p.name).join(', ')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button className="p-2 hover:bg-mc-bg-tertiary/80 rounded-xl transition-all" title="Voice call">
            <Phone className="w-5 h-5 text-mc-text-secondary hover:text-mc-text" />
          </button>
          <button className="p-2 hover:bg-mc-bg-tertiary/80 rounded-xl transition-all" title="Video call">
            <Video className="w-5 h-5 text-mc-text-secondary hover:text-mc-text" />
          </button>
          <button className="p-2 hover:bg-mc-bg-tertiary/80 rounded-xl transition-all" title="More options">
            <MoreVertical className="w-5 h-5 text-mc-text-secondary hover:text-mc-text" />
          </button>
        </div>
      </div>

      {/* Enhanced Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Date separator */}
        <div className="flex justify-center">
          <span className="text-xs text-mc-text-secondary bg-mc-bg-tertiary/50 px-3 py-1 rounded-full">
            Today
          </span>
        </div>

        {displayMessages.map((message, index) => (
          <EnhancedMessageBubble 
            key={message.id} 
            message={message} 
            isOpenClaw={!!linkedAgentInfo}
            prevMessage={index > 0 ? displayMessages[index - 1] : null}
            theme={chatTheme}
          />
        ))}

        {/* Typing indicator */}
        {isTyping && linkedAgentInfo && (
          <div className="flex items-start gap-3 animate-fade-in">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-mc-accent/20 to-mc-accent/5 flex items-center justify-center border border-mc-accent/20">
              <span className="text-lg">{linkedAgentInfo.agent.avatar_emoji}</span>
            </div>
            <div className="bg-mc-bg-tertiary/80 backdrop-blur-sm rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-mc-text-secondary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-mc-text-secondary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-mc-text-secondary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {displayMessages.length === 0 && linkedAgentInfo && (
          <div className="flex flex-col items-center justify-center py-12 text-mc-text-secondary">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-mc-accent/10 to-mc-accent/5 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-mc-accent/50" />
            </div>
            <p className="text-sm">Start a conversation with {linkedAgentInfo.agent.name}</p>
            <p className="text-xs mt-1 opacity-60">Connected via OpenClaw Gateway</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Enhanced Input Area */}
      <div className="p-4 border-t border-mc-border/50 backdrop-blur-sm bg-mc-bg/80">
        {/* Quick actions bar */}
        {!linkedAgentInfo && (
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1">
              <select
                value={selectedSender}
                onChange={(e) => setSelectedSender(e.target.value)}
                className="w-full max-w-xs bg-mc-bg border border-mc-border/50 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-mc-accent"
              >
                <option value="">Speaking as...</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.avatar_emoji} {agent.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* File preview */}
        {selectedFile && (
          <div className="mb-3 flex items-center gap-3 bg-mc-accent/10 border border-mc-accent/20 rounded-xl p-3">
            <div className="w-10 h-10 rounded-lg bg-mc-accent/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-mc-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{selectedFile.name}</p>
              <p className="text-xs text-mc-text-secondary">{(selectedFile.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              className="p-1.5 hover:bg-mc-accent/20 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-mc-accent" />
            </button>
          </div>
        )}

        {/* Input field */}
        <form onSubmit={handleSendMessage} className="flex items-end gap-2">
          <div className="flex-1 bg-mc-bg-tertiary/50 backdrop-blur-sm border border-mc-border/50 rounded-2xl flex items-end gap-2 p-2 focus-within:border-mc-accent/50 focus-within:bg-mc-bg-tertiary transition-all">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 hover:bg-mc-bg rounded-xl transition-colors text-mc-text-secondary hover:text-mc-text"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="hidden"
            />

            <textarea
              ref={textareaRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={linkedAgentInfo ? `Message ${linkedAgentInfo.agent.name}...` : 'Type a message...'}
              className="flex-1 bg-transparent border-none resize-none py-2 px-1 text-sm focus:outline-none min-h-[40px] max-h-[120px]"
              rows={1}
            />

            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-2 hover:bg-mc-bg rounded-xl transition-colors text-mc-text-secondary hover:text-mc-text"
            >
              <Smile className="w-5 h-5" />
            </button>

            <button
              type="button"
              className="p-2 hover:bg-mc-bg rounded-xl transition-colors text-mc-text-secondary hover:text-mc-text"
            >
              <Mic className="w-5 h-5" />
            </button>
          </div>

          <button
            type="submit"
            disabled={(!newMessage.trim() && !selectedFile) || (!linkedAgentInfo && !selectedSender) || isSendingToOpenClaw}
            className="p-3 bg-gradient-to-r from-mc-accent to-mc-accent/90 text-mc-bg rounded-2xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-mc-accent/20"
          >
            {isSendingToOpenClaw ? (
              <div className="w-5 h-5 border-2 border-mc-bg border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>

        {/* Quick commands */}
        {newMessage.startsWith('/') && (
          <div className="mt-2 bg-mc-bg border border-mc-border rounded-xl shadow-lg overflow-hidden">
            <div className="p-2 text-xs text-mc-text-secondary border-b border-mc-border">
              Quick commands
            </div>
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-mc-bg-tertiary flex items-center gap-2">
              <Command className="w-4 h-4" />
              /task - Create a new task
            </button>
            <button className="w-full px-4 py-2 text-left text-sm hover:bg-mc-bg-tertiary flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              /ai - Ask AI assistant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EnhancedMessageBubble({ 
  message, 
  isOpenClaw, 
  prevMessage,
  theme 
}: { 
  message: Message; 
  isOpenClaw?: boolean;
  prevMessage?: Message | null;
  theme: ChatTheme;
}) {
  const sender = message.sender as Agent | undefined;
  let openclawRole: string | null = null;
  
  if (message.metadata) {
    try {
      const meta = JSON.parse(message.metadata);
      if (meta.source === 'openclaw') {
        openclawRole = meta.role;
      }
    } catch {}
  }

  const isYourMessage = openclawRole === 'user';
  const isNewSender = !prevMessage || prevMessage.sender_agent_id !== message.sender_agent_id;
  const showAvatar = isNewSender;

  const formatContent = (content: string) => {
    // Highlight code blocks, links, mentions
    let formatted = content
      .replace(/```([\s\S]*?)```/g, '<pre class="bg-mc-bg-tertiary p-2 rounded-lg my-2 overflow-x-auto text-xs font-mono"><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code class="bg-mc-bg-tertiary px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
      .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-mc-accent hover:underline">$1</a>')
      .replace(/@(\w+)/g, '<span class="text-mc-accent font-medium">@$1</span>');
    return formatted;
  };

  return (
    <div className={`flex ${isYourMessage ? 'flex-row-reverse' : 'flex-row'} gap-3 animate-slide-in`}>
      {/* Avatar */}
      {showAvatar && (
        <div className={`flex-shrink-0 ${isYourMessage ? 'mt-0' : 'mt-1'}`}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-mc-accent/20 to-mc-accent/5 flex items-center justify-center border border-mc-accent/20 text-lg shadow-sm">
            {isYourMessage ? '👤' : (sender?.avatar_emoji || '🤖')}
          </div>
        </div>
      )}
      
      {!showAvatar && <div className="w-9 flex-shrink-0" />}

      {/* Message content */}
      <div className={`flex-1 min-w-0 ${isYourMessage ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Sender name */}
        {showAvatar && (
          <div className={`flex items-center gap-2 mb-1 ${isYourMessage ? 'flex-row-reverse' : ''}`}>
            <span className="text-xs font-semibold text-mc-text">
              {isYourMessage ? 'You' : (sender?.name || 'Assistant')}
            </span>
            {isOpenClaw && !isYourMessage && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <Zap className="w-3 h-3" />
                AI
              </span>
            )}
            <span className="text-xs text-mc-text-secondary">
              {format(new Date(message.created_at), 'h:mm a')}
            </span>
          </div>
        )}

        {/* Bubble */}
        <div 
          className={`max-w-[85%] px-4 py-2.5 shadow-sm ${
            isYourMessage 
              ? 'bg-gradient-to-r from-mc-accent to-mc-accent/90 text-white rounded-2xl rounded-tr-sm' 
              : 'bg-mc-bg-tertiary/80 backdrop-blur-sm text-mc-text rounded-2xl rounded-tl-sm border border-mc-border/30'
          }`}
          dangerouslySetInnerHTML={{ __html: formatContent(message.content) }}
        />

        {/* Reactions / actions */}
        <div className={`flex items-center gap-1 mt-1 ${isYourMessage ? 'flex-row-reverse' : ''}`}>
          <button className="p-1 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary opacity-0 group-hover:opacity-100 transition-opacity">
            <Smile className="w-3.5 h-3.5" />
          </button>
          <button className="p-1 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary text-xs opacity-0 group-hover:opacity-100 transition-opacity">
            Reply
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConversationListProps {
  conversations: Conversation[];
  onSelect: (conv: Conversation) => void;
  onNewConversation: () => void;
  showNewConvoModal: boolean;
  setShowNewConvoModal: (show: boolean) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  showSearch: boolean;
  setShowSearch: (show: boolean) => void;
}

function ConversationList({
  conversations,
  onSelect,
  onNewConversation,
  showNewConvoModal,
  setShowNewConvoModal,
  searchQuery,
  setSearchQuery,
  showSearch,
  setShowSearch,
}: ConversationListProps) {
  const { agents, setConversations } = useMissionControl();
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [title, setTitle] = useState('');

  const handleCreateConversation = async () => {
    if (selectedAgents.length < 1) return;

    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || 'New Conversation',
          type: selectedAgents.length > 2 ? 'group' : 'direct',
          participant_ids: selectedAgents,
        }),
      });

      if (res.ok) {
        const newConvo = await res.json();
        setConversations([newConvo, ...conversations]);
        setShowNewConvoModal(false);
        setSelectedAgents([]);
        setTitle('');
        onSelect(newConvo);
      }
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-mc-bg to-mc-bg-secondary">
      {/* Header */}
      <div className="p-4 border-b border-mc-border/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Messages</h2>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setShowSearch(!showSearch)}
              className="p-2 hover:bg-mc-bg-tertiary rounded-xl transition-colors"
            >
              <Search className="w-5 h-5 text-mc-text-secondary" />
            </button>
            <button
              onClick={onNewConversation}
              className="p-2 bg-mc-accent text-mc-bg rounded-xl hover:bg-mc-accent/90 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mc-text-secondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-mc-bg-tertiary/50 border border-mc-border/30 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-mc-accent"
              autoFocus
            />
          </div>
        )}

        {/* Quick filters */}
        <div className="flex gap-2">
          <button className="px-3 py-1.5 bg-mc-accent/10 text-mc-accent rounded-full text-xs font-medium">
            All
          </button>
          <button className="px-3 py-1.5 hover:bg-mc-bg-tertiary rounded-full text-xs text-mc-text-secondary transition-colors">
            OpenClaw
          </button>
          <button className="px-3 py-1.5 hover:bg-mc-bg-tertiary rounded-full text-xs text-mc-text-secondary transition-colors">
            Groups
          </button>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.map((conv, index) => {
          const isFirst = index === 0;
          return (
            <button
              key={conv.id}
              onClick={() => onSelect(conv)}
              className={`w-full p-3 text-left rounded-xl transition-all hover:bg-mc-bg-tertiary/50 active:scale-[0.98] ${
                isFirst ? 'bg-mc-bg-tertiary/30 border border-mc-accent/10' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Avatar stack */}
                <div className="relative">
                  <div className="flex -space-x-2">
                    {conv.participants?.slice(0, 3).map((p, i) => (
                      <div 
                        key={p.id} 
                        className="w-10 h-10 rounded-xl bg-gradient-to-br from-mc-accent/20 to-mc-accent/5 flex items-center justify-center border-2 border-mc-bg text-lg shadow-sm"
                        style={{ zIndex: 3 - i }}
                      >
                        {p.avatar_emoji}
                      </div>
                    ))}
                  </div>
                  {isFirst && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-mc-accent rounded-full flex items-center justify-center border-2 border-mc-bg">
                      <span className="text-xs font-bold text-white">2</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm truncate">
                      {conv.title || conv.participants?.map((p) => p.name).join(', ')}
                    </p>
                    <span className="text-xs text-mc-text-secondary">
                      {conv.last_message ? formatDistanceToNow(new Date(conv.last_message.created_at), { addSuffix: true }) : ''}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {conv.last_message && (
                      <p className={`text-xs truncate ${isFirst ? 'text-mc-text' : 'text-mc-text-secondary'}`}>
                        {conv.last_message.sender?.name ? `${conv.last_message.sender.name}: ` : ''}
                        {conv.last_message.content}
                      </p>
                    )}
                    {isFirst && (
                      <span className="flex-shrink-0 w-2 h-2 bg-mc-accent rounded-full" />
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-mc-text-secondary">
            <div className="w-16 h-16 rounded-2xl bg-mc-bg-tertiary flex items-center justify-center mb-4">
              <Users className="w-8 h-8 opacity-40" />
            </div>
            <p className="text-sm">No conversations yet</p>
            <p className="text-xs mt-1 opacity-60">Start chatting with your agents</p>
          </div>
        )}
      </div>

      {/* New Conversation Modal */}
      {showNewConvoModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-mc-bg-secondary border border-mc-border/50 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-mc-border/50">
              <h3 className="font-bold text-lg">New Conversation</h3>
              <p className="text-sm text-mc-text-secondary mt-1">
                Start chatting with one or more agents
              </p>
            </div>

            <div className="p-4 space-y-4 max-h-80 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium mb-2">Conversation Name</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Project Alpha Planning"
                  className="w-full bg-mc-bg border border-mc-border/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-mc-accent focus:ring-1 focus:ring-mc-accent/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Select Participants</label>
                <div className="space-y-1">
                  {agents.map((agent) => (
                    <label
                      key={agent.id}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                        selectedAgents.includes(agent.id) 
                          ? 'bg-mc-accent/10 border border-mc-accent/30' 
                          : 'hover:bg-mc-bg-tertiary/50 border border-transparent'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAgents.includes(agent.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedAgents([...selectedAgents, agent.id]);
                          } else {
                            setSelectedAgents(selectedAgents.filter((id) => id !== agent.id));
                          }
                        }}
                        className="w-4 h-4 accent-mc-accent"
                      />
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-mc-accent/20 to-mc-accent/5 flex items-center justify-center border border-mc-accent/20 text-lg">
                        {agent.avatar_emoji}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{agent.name}</p>
                        <p className="text-xs text-mc-text-secondary">{agent.role}</p>
                      </div>
                      {selectedAgents.includes(agent.id) && (
                        <Check className="w-5 h-5 text-mc-accent" />
                      )}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-mc-border/50 flex justify-end gap-2">
              <button
                onClick={() => setShowNewConvoModal(false)}
                className="px-4 py-2 text-sm text-mc-text-secondary hover:text-mc-text transition-colors rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateConversation}
                disabled={selectedAgents.length < 1}
                className="px-6 py-2 bg-mc-accent text-mc-bg rounded-xl text-sm font-medium hover:bg-mc-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-mc-accent/20"
              >
                Start Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
