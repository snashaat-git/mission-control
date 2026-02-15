'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Phone, PhoneOff, Send, Loader2, Clock, BookUser, Plus, Trash2, Search } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { useToast } from '@/hooks/useToast';
import type { VoiceCall } from '@/lib/types';

interface VoiceCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefillAgentId?: string;
}

interface Contact {
  id: string;
  name: string;
  phone_number: string;
  label: string | null;
}

type CallPhase = 'idle' | 'connecting' | 'active' | 'ended';
type IdleTab = 'dial' | 'contacts';

export function VoiceCallModal({ isOpen, onClose, prefillAgentId }: VoiceCallModalProps) {
  const { agents, activeCall, setActiveCall, addVoiceCall, updateVoiceCall } = useMissionControl();
  const { success: showSuccess, error: showError } = useToast();

  const [phase, setPhase] = useState<CallPhase>('idle');
  const [idleTab, setIdleTab] = useState<IdleTab>('dial');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [agentId, setAgentId] = useState(prefillAgentId || '');
  const [message, setMessage] = useState('');
  const [callMode, setCallMode] = useState<'conversation' | 'notify'>('conversation');
  const [speakInput, setSpeakInput] = useState('');
  const [transcript, setTranscript] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Phonebook state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactLabel, setNewContactLabel] = useState('');

  // Load contacts
  useEffect(() => {
    if (isOpen) {
      loadContacts();
    }
  }, [isOpen]);

  const loadContacts = async () => {
    try {
      const res = await fetch('/api/contacts');
      if (res.ok) {
        setContacts(await res.json());
      }
    } catch {
      // ignore
    }
  };

  const handleAddContact = async () => {
    if (!newContactName.trim() || !newContactPhone.trim()) return;

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newContactName.trim(),
          phone_number: newContactPhone.trim(),
          label: newContactLabel.trim() || null,
        }),
      });

      if (res.ok) {
        setNewContactName('');
        setNewContactPhone('');
        setNewContactLabel('');
        setShowAddContact(false);
        await loadContacts();
        showSuccess('Contact added');
      }
    } catch {
      showError('Failed to add contact');
    }
  };

  const handleDeleteContact = async (id: string) => {
    try {
      await fetch(`/api/contacts?id=${id}`, { method: 'DELETE' });
      setContacts(prev => prev.filter(c => c.id !== id));
    } catch {
      showError('Failed to delete contact');
    }
  };

  const handleSelectContact = (contact: Contact) => {
    setPhoneNumber(contact.phone_number);
    setIdleTab('dial');
  };

  const filteredContacts = contactSearch
    ? contacts.filter(c =>
        c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
        c.phone_number.includes(contactSearch)
      )
    : contacts;

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
          mode: callMode,
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
              {/* Tab switcher: Dial / Contacts */}
              <div className="flex border-b border-mc-border">
                <button
                  onClick={() => setIdleTab('dial')}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    idleTab === 'dial'
                      ? 'border-mc-accent text-mc-accent'
                      : 'border-transparent text-mc-text-secondary hover:text-mc-text'
                  }`}
                >
                  <Phone className="w-4 h-4" />
                  Dial
                </button>
                <button
                  onClick={() => setIdleTab('contacts')}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    idleTab === 'contacts'
                      ? 'border-mc-accent text-mc-accent'
                      : 'border-transparent text-mc-text-secondary hover:text-mc-text'
                  }`}
                >
                  <BookUser className="w-4 h-4" />
                  Contacts
                  {contacts.length > 0 && (
                    <span className="ml-1 text-xs bg-mc-bg-tertiary px-1.5 py-0.5 rounded-full">{contacts.length}</span>
                  )}
                </button>
              </div>

              {idleTab === 'dial' && (
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
                    <label className="block text-sm font-medium text-mc-text mb-1">Call Mode</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCallMode('conversation')}
                        className={`flex-1 px-3 py-2 rounded border text-sm font-medium transition-colors ${
                          callMode === 'conversation'
                            ? 'bg-mc-accent text-mc-bg border-mc-accent'
                            : 'bg-mc-bg border-mc-border text-mc-text-secondary hover:border-mc-accent'
                        }`}
                      >
                        Conversation
                        <span className="block text-xs font-normal mt-0.5 opacity-75">Two-way talk</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCallMode('notify')}
                        className={`flex-1 px-3 py-2 rounded border text-sm font-medium transition-colors ${
                          callMode === 'notify'
                            ? 'bg-mc-accent text-mc-bg border-mc-accent'
                            : 'bg-mc-bg border-mc-border text-mc-text-secondary hover:border-mc-accent'
                        }`}
                      >
                        Notify
                        <span className="block text-xs font-normal mt-0.5 opacity-75">Speak &amp; hang up</span>
                      </button>
                    </div>
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

              {idleTab === 'contacts' && (
                <div className="space-y-3">
                  {/* Search + Add */}
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mc-text-secondary" />
                      <input
                        type="text"
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        placeholder="Search contacts..."
                        className="w-full pl-9 pr-3 py-2 bg-mc-bg border border-mc-border rounded text-mc-text text-sm focus:border-mc-accent focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => setShowAddContact(!showAddContact)}
                      className={`p-2 rounded border transition-colors ${
                        showAddContact
                          ? 'bg-mc-accent text-mc-bg border-mc-accent'
                          : 'bg-mc-bg border-mc-border text-mc-text-secondary hover:border-mc-accent'
                      }`}
                      title="Add contact"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Add contact form */}
                  {showAddContact && (
                    <div className="p-3 bg-mc-bg rounded-lg border border-mc-accent/30 space-y-2">
                      <input
                        type="text"
                        value={newContactName}
                        onChange={(e) => setNewContactName(e.target.value)}
                        placeholder="Name"
                        className="w-full px-3 py-1.5 bg-mc-bg-secondary border border-mc-border rounded text-mc-text text-sm focus:border-mc-accent focus:outline-none"
                        autoFocus
                      />
                      <input
                        type="tel"
                        value={newContactPhone}
                        onChange={(e) => setNewContactPhone(e.target.value)}
                        placeholder="Phone number (+1 555 000 1234)"
                        className="w-full px-3 py-1.5 bg-mc-bg-secondary border border-mc-border rounded text-mc-text text-sm focus:border-mc-accent focus:outline-none"
                      />
                      <input
                        type="text"
                        value={newContactLabel}
                        onChange={(e) => setNewContactLabel(e.target.value)}
                        placeholder="Label (optional: work, personal, etc.)"
                        className="w-full px-3 py-1.5 bg-mc-bg-secondary border border-mc-border rounded text-mc-text text-sm focus:border-mc-accent focus:outline-none"
                      />
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          onClick={() => setShowAddContact(false)}
                          className="px-3 py-1.5 text-xs text-mc-text-secondary hover:text-mc-text"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddContact}
                          disabled={!newContactName.trim() || !newContactPhone.trim()}
                          className="px-3 py-1.5 bg-mc-accent text-mc-bg rounded text-xs font-medium hover:bg-mc-accent/90 disabled:opacity-50"
                        >
                          Save Contact
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Contact list */}
                  <div className="space-y-1 max-h-[280px] overflow-y-auto">
                    {filteredContacts.length === 0 ? (
                      <div className="text-center py-8 text-mc-text-secondary text-sm">
                        {contacts.length === 0 ? (
                          <>
                            <BookUser className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p>No contacts yet</p>
                            <p className="text-xs mt-1">Click + to add your first contact</p>
                          </>
                        ) : (
                          <p>No matching contacts</p>
                        )}
                      </div>
                    ) : (
                      filteredContacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-mc-bg-tertiary transition-colors group cursor-pointer"
                          onClick={() => handleSelectContact(contact)}
                        >
                          <div className="w-9 h-9 rounded-full bg-mc-accent/15 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-semibold text-mc-accent">
                              {contact.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-mc-text truncate">{contact.name}</span>
                              {contact.label && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-mc-bg-tertiary rounded text-mc-text-secondary">
                                  {contact.label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-mc-text-secondary font-mono">{contact.phone_number}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectContact(contact);
                              }}
                              className="p-1.5 rounded hover:bg-mc-accent/20 text-mc-accent"
                              title="Call this contact"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteContact(contact.id);
                              }}
                              className="p-1.5 rounded hover:bg-red-500/20 text-mc-text-secondary hover:text-red-400"
                              title="Delete contact"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
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
              {idleTab === 'dial' && (
                <button
                  onClick={handleInitiateCall}
                  disabled={!phoneNumber.trim() || !message.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-mc-accent-green text-white rounded hover:bg-mc-accent-green/90 disabled:opacity-50 text-sm font-medium"
                >
                  <Phone className="w-4 h-4" />
                  Start Call
                </button>
              )}
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
