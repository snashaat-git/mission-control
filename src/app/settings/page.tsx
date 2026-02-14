/**
 * Settings Page
 * Configure Mission Control paths, URLs, and preferences
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Save, RotateCcw, Home, FolderOpen, Link as LinkIcon, Radio, Eye, EyeOff, Zap, Bell, Sun, Moon, Shield, Phone } from 'lucide-react';
import { getConfig, updateConfig, resetConfig, type MissionControlConfig } from '@/lib/config';
import { getNotificationSettings, setNotificationsEnabled, requestNotificationPermission } from '@/hooks/useNotifications';
import { useTheme } from '@/hooks/useTheme';

export default function SettingsPage() {
  const router = useRouter();
  const [config, setConfig] = useState<MissionControlConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gateway settings (server-side)
  const [gatewayUrl, setGatewayUrl] = useState('ws://127.0.0.1:18789');
  const [gatewayToken, setGatewayToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [gatewayAutoDetected, setGatewayAutoDetected] = useState({ openclawJsonToken: false, deviceIdentity: false });
  const [gatewaySaving, setGatewaySaving] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState<{ connected: boolean; error?: string } | null>(null);
  const [gatewayTesting, setGatewayTesting] = useState(false);

  // Theme
  const { theme, setTheme } = useTheme();

  // Rate limit settings
  interface RateLimitTier {
    id: string;
    label: string;
    description: string;
    routes: string;
    max: number;
    windowSeconds: number;
  }
  const [rateLimitTiers, setRateLimitTiers] = useState<RateLimitTier[]>([]);
  const [rateLimitSaving, setRateLimitSaving] = useState(false);

  // Voice call settings (client-side)
  const [voiceDefaultNumber, setVoiceDefaultNumber] = useState('');
  const [voiceInboundPolicy, setVoiceInboundPolicy] = useState('allowlist');

  useEffect(() => {
    setVoiceDefaultNumber(localStorage.getItem('mc-voice-default-number') || '');
    setVoiceInboundPolicy(localStorage.getItem('mc-voice-inbound-policy') || 'allowlist');
  }, []);

  // Notification settings (client-side only)
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');
  const [notifSupported, setNotifSupported] = useState(false);

  useEffect(() => {
    const ns = getNotificationSettings();
    setNotifSupported(ns.supported);
    setNotifPermission(ns.permission);
    setNotifEnabled(ns.enabled);
  }, []);

  useEffect(() => {
    setConfig(getConfig());
    // Fetch rate limit settings
    fetch('/api/settings/rate-limit')
      .then(res => res.json())
      .then(data => setRateLimitTiers(data.tiers || []))
      .catch(() => {});
    // Fetch gateway settings from server
    fetch('/api/settings/gateway')
      .then(res => res.json())
      .then(data => {
        setGatewayUrl(data.gatewayUrl || 'ws://127.0.0.1:18789');
        setGatewayToken(data.gatewayToken || '');
        setGatewayAutoDetected(data.autoDetected || { openclawJsonToken: false, deviceIdentity: false });
      })
      .catch(() => {});
    // Fetch current connection status
    fetch('/api/openclaw/status')
      .then(res => res.json())
      .then(data => setGatewayStatus({ connected: data.connected, error: data.error }))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!config) return;

    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      updateConfig(config);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      resetConfig();
      setConfig(getConfig());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const handleRateLimitSave = async () => {
    setRateLimitSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/rate-limit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiers: rateLimitTiers }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save rate limits');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setRateLimitSaving(false);
    }
  };

  const updateTier = (id: string, field: 'max' | 'windowSeconds', value: number) => {
    setRateLimitTiers(tiers =>
      tiers.map(t => t.id === id ? { ...t, [field]: value } : t)
    );
  };

  const handleGatewaySave = async () => {
    setGatewaySaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/gateway', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gatewayUrl, gatewayToken }),
      });
      const data = await res.json();
      if (data.saved) {
        setGatewayStatus({ connected: data.connected, error: data.error });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setError(data.error || 'Failed to save gateway settings');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setGatewaySaving(false);
    }
  };

  const handleGatewayTest = async () => {
    setGatewayTesting(true);
    try {
      const res = await fetch('/api/openclaw/status');
      const data = await res.json();
      setGatewayStatus({ connected: data.connected, error: data.error });
    } catch {
      setGatewayStatus({ connected: false, error: 'Failed to reach status endpoint' });
    } finally {
      setGatewayTesting(false);
    }
  };

  const handleChange = (field: keyof MissionControlConfig, value: string) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  if (!config) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-mc-text-secondary">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mc-bg">
      {/* Header */}
      <div className="border-b border-mc-border bg-mc-bg-secondary">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
              title="Back to Mission Control"
            >
              ← Back
            </button>
            <Settings className="w-6 h-6 text-mc-accent" />
            <h1 className="text-2xl font-bold text-mc-text">Settings</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-4 py-2 border border-mc-border rounded hover:bg-mc-bg-tertiary text-mc-text-secondary flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Defaults
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-mc-accent text-mc-bg rounded hover:bg-mc-accent/90 flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Success Message */}
        {saveSuccess && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded text-green-400">
            ✓ Settings saved successfully
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded text-red-400">
            ✗ {error}
          </div>
        )}

        {/* Workspace Paths */}
        <section className="mb-8 p-6 bg-mc-bg-secondary border border-mc-border rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen className="w-5 h-5 text-mc-accent" />
            <h2 className="text-xl font-semibold text-mc-text">Workspace Paths</h2>
          </div>
          <p className="text-sm text-mc-text-secondary mb-4">
            Configure where Mission Control stores projects and deliverables.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-mc-text mb-2">
                Workspace Base Path
              </label>
              <input
                type="text"
                value={config.workspaceBasePath}
                onChange={(e) => handleChange('workspaceBasePath', e.target.value)}
                placeholder="~/Documents/Shared"
                className="w-full px-4 py-2 bg-mc-bg border border-mc-border rounded text-mc-text focus:border-mc-accent focus:outline-none"
              />
              <p className="text-xs text-mc-text-secondary mt-1">
                Base directory for all Mission Control files. Use ~ for home directory.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-mc-text mb-2">
                Projects Path
              </label>
              <input
                type="text"
                value={config.projectsPath}
                onChange={(e) => handleChange('projectsPath', e.target.value)}
                placeholder="~/Documents/Shared/projects"
                className="w-full px-4 py-2 bg-mc-bg border border-mc-border rounded text-mc-text focus:border-mc-accent focus:outline-none"
              />
              <p className="text-xs text-mc-text-secondary mt-1">
                Directory where project folders are created. Each project gets its own folder.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-mc-text mb-2">
                Default Project Name
              </label>
              <input
                type="text"
                value={config.defaultProjectName}
                onChange={(e) => handleChange('defaultProjectName', e.target.value)}
                placeholder="mission-control"
                className="w-full px-4 py-2 bg-mc-bg border border-mc-border rounded text-mc-text focus:border-mc-accent focus:outline-none"
              />
              <p className="text-xs text-mc-text-secondary mt-1">
                Default name for new projects. Can be changed per project.
              </p>
            </div>
          </div>
        </section>

        {/* API Configuration */}
        <section className="mb-8 p-6 bg-mc-bg-secondary border border-mc-border rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <LinkIcon className="w-5 h-5 text-mc-accent" />
            <h2 className="text-xl font-semibold text-mc-text">API Configuration</h2>
          </div>
          <p className="text-sm text-mc-text-secondary mb-4">
            Configure Mission Control API URL for agent orchestration.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-mc-text mb-2">
                Mission Control URL
              </label>
              <input
                type="text"
                value={config.missionControlUrl}
                onChange={(e) => handleChange('missionControlUrl', e.target.value)}
                placeholder="http://localhost:3000"
                className="w-full px-4 py-2 bg-mc-bg border border-mc-border rounded text-mc-text focus:border-mc-accent focus:outline-none"
              />
              <p className="text-xs text-mc-text-secondary mt-1">
                URL where Mission Control is running. Auto-detected by default. Change for remote access.
              </p>
            </div>
          </div>
        </section>

        {/* OpenClaw Gateway */}
        <section className="mb-8 p-6 bg-mc-bg-secondary border border-mc-border rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <Radio className="w-5 h-5 text-mc-accent" />
            <h2 className="text-xl font-semibold text-mc-text">OpenClaw Gateway</h2>
            {gatewayStatus && (
              <span className={`ml-auto text-xs px-2 py-1 rounded ${
                gatewayStatus.connected
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {gatewayStatus.connected ? 'Connected' : 'Disconnected'}
              </span>
            )}
          </div>
          <p className="text-sm text-mc-text-secondary mb-4">
            Configure the connection to the OpenClaw Gateway for agent communication.
            {gatewayAutoDetected.openclawJsonToken && !gatewayToken && (
              <span className="block mt-1 text-xs text-green-400">
                Auto-detected gateway token from ~/.openclaw/openclaw.json
              </span>
            )}
            {gatewayAutoDetected.deviceIdentity && (
              <span className="block mt-1 text-xs text-green-400">
                Auto-detected device identity from ~/.openclaw/identity/
              </span>
            )}
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-mc-text mb-2">
                Gateway URL
              </label>
              <input
                type="text"
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                placeholder="ws://127.0.0.1:18789"
                className="w-full px-4 py-2 bg-mc-bg border border-mc-border rounded text-mc-text focus:border-mc-accent focus:outline-none font-mono text-sm"
              />
              <p className="text-xs text-mc-text-secondary mt-1">
                WebSocket URL of the OpenClaw Gateway. Use wss:// for remote/Tailscale connections.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-mc-text mb-2">
                Gateway Token
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={gatewayToken}
                  onChange={(e) => setGatewayToken(e.target.value)}
                  placeholder={gatewayAutoDetected.openclawJsonToken ? '(auto-detected from openclaw.json)' : 'Enter gateway auth token'}
                  className="w-full px-4 py-2 pr-10 bg-mc-bg border border-mc-border rounded text-mc-text focus:border-mc-accent focus:outline-none font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-mc-text-secondary hover:text-mc-text"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-mc-text-secondary mt-1">
                Leave empty to use auto-detected token from ~/.openclaw/openclaw.json. Set explicitly to override.
              </p>
            </div>

            {gatewayStatus?.error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
                {gatewayStatus.error}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleGatewaySave}
                disabled={gatewaySaving}
                className="px-4 py-2 bg-mc-accent text-mc-bg rounded hover:bg-mc-accent/90 flex items-center gap-2 disabled:opacity-50 text-sm"
              >
                <Save className="w-4 h-4" />
                {gatewaySaving ? 'Saving & Reconnecting...' : 'Save & Reconnect'}
              </button>
              <button
                onClick={handleGatewayTest}
                disabled={gatewayTesting}
                className="px-4 py-2 border border-mc-border rounded hover:bg-mc-bg-tertiary text-mc-text-secondary flex items-center gap-2 disabled:opacity-50 text-sm"
              >
                <Zap className="w-4 h-4" />
                {gatewayTesting ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
          </div>
        </section>

        {/* Appearance */}
        <section className="mb-8 p-6 bg-mc-bg-secondary border border-mc-border rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            {theme === 'dark' ? <Moon className="w-5 h-5 text-mc-accent" /> : <Sun className="w-5 h-5 text-mc-accent" />}
            <h2 className="text-xl font-semibold text-mc-text">Appearance</h2>
          </div>
          <p className="text-sm text-mc-text-secondary mb-4">
            Choose between dark and light themes.
          </p>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-mc-text">Theme</label>
              <p className="text-xs text-mc-text-secondary mt-0.5">
                {theme === 'dark' ? 'Dark mode is active' : 'Light mode is active'}
              </p>
            </div>
            <div className="flex items-center gap-2 bg-mc-bg rounded-lg border border-mc-border p-1">
              <button
                onClick={() => setTheme('dark')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
                  theme === 'dark'
                    ? 'bg-mc-accent text-white'
                    : 'text-mc-text-secondary hover:text-mc-text'
                }`}
              >
                <Moon className="w-4 h-4" />
                Dark
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
                  theme === 'light'
                    ? 'bg-mc-accent text-white'
                    : 'text-mc-text-secondary hover:text-mc-text'
                }`}
              >
                <Sun className="w-4 h-4" />
                Light
              </button>
            </div>
          </div>
        </section>

        {/* API Rate Limiting */}
        <section className="mb-8 p-6 bg-mc-bg-secondary border border-mc-border rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-mc-accent" />
            <h2 className="text-xl font-semibold text-mc-text">API Rate Limiting</h2>
          </div>
          <p className="text-sm text-mc-text-secondary mb-4">
            Control how many API requests are allowed per time window. Protects against abuse and runaway polling.
            SSE connections are always exempt.
          </p>

          {rateLimitTiers.length === 0 ? (
            <div className="text-sm text-mc-text-secondary">Loading rate limit settings...</div>
          ) : (
            <div className="space-y-4">
              {rateLimitTiers.map((tier) => (
                <div key={tier.id} className="p-4 bg-mc-bg rounded-lg border border-mc-border">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                        tier.id === 'strict' ? 'bg-mc-accent-red/20 text-mc-accent-red' :
                        tier.id === 'standard' ? 'bg-mc-accent/20 text-mc-accent' :
                        'bg-mc-accent-green/20 text-mc-accent-green'
                      }`}>
                        {tier.label}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-mc-text-secondary mb-3">{tier.description}</p>
                  <p className="text-xs text-mc-text-secondary mb-3 font-mono">{tier.routes}</p>

                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-xs text-mc-text-secondary mb-1">Max requests</label>
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={tier.max}
                        onChange={(e) => updateTier(tier.id, 'max', parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-1.5 bg-mc-bg-secondary border border-mc-border rounded text-mc-text text-sm focus:border-mc-accent focus:outline-none"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-mc-text-secondary mb-1">Window (seconds)</label>
                      <input
                        type="number"
                        min={10}
                        max={3600}
                        value={tier.windowSeconds}
                        onChange={(e) => updateTier(tier.id, 'windowSeconds', parseInt(e.target.value) || 60)}
                        className="w-full px-3 py-1.5 bg-mc-bg-secondary border border-mc-border rounded text-mc-text text-sm focus:border-mc-accent focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={handleRateLimitSave}
                disabled={rateLimitSaving}
                className="px-4 py-2 bg-mc-accent text-mc-bg rounded hover:bg-mc-accent/90 flex items-center gap-2 disabled:opacity-50 text-sm"
              >
                <Save className="w-4 h-4" />
                {rateLimitSaving ? 'Saving...' : 'Save Rate Limits'}
              </button>
            </div>
          )}
        </section>

        {/* Browser Notifications */}
        <section className="mb-8 p-6 bg-mc-bg-secondary border border-mc-border rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-mc-accent" />
            <h2 className="text-xl font-semibold text-mc-text">Browser Notifications</h2>
            <span className={`ml-auto text-xs px-2 py-1 rounded ${
              notifEnabled && notifPermission === 'granted'
                ? 'bg-green-500/20 text-green-400'
                : 'bg-mc-bg-tertiary text-mc-text-secondary'
            }`}>
              {!notifSupported ? 'Not Supported' :
               notifPermission === 'denied' ? 'Blocked' :
               notifEnabled && notifPermission === 'granted' ? 'Active' : 'Off'}
            </span>
          </div>
          <p className="text-sm text-mc-text-secondary mb-4">
            Get notified when tasks complete, fail, or need review — even when the tab is in the background.
          </p>

          <div className="space-y-4">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-mc-text">Enable Notifications</label>
                <p className="text-xs text-mc-text-secondary mt-0.5">
                  Task completed, failed, ready for review, agent finished
                </p>
              </div>
              <button
                onClick={() => {
                  const next = !notifEnabled;
                  setNotificationsEnabled(next);
                  setNotifEnabled(next);
                }}
                disabled={!notifSupported}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  notifEnabled ? 'bg-mc-accent' : 'bg-mc-bg-tertiary border border-mc-border'
                } ${!notifSupported ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  notifEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {/* Permission status */}
            {notifSupported && notifPermission === 'default' && (
              <div className="flex items-center gap-3 p-3 bg-mc-accent/10 border border-mc-accent/20 rounded">
                <p className="text-sm text-mc-text flex-1">
                  Browser permission required to show notifications.
                </p>
                <button
                  onClick={async () => {
                    const result = await requestNotificationPermission();
                    setNotifPermission(result);
                    if (result === 'granted') {
                      setNotificationsEnabled(true);
                      setNotifEnabled(true);
                    }
                  }}
                  className="px-3 py-1.5 bg-mc-accent text-mc-bg rounded text-sm hover:bg-mc-accent/90 whitespace-nowrap"
                >
                  Grant Permission
                </button>
              </div>
            )}

            {notifSupported && notifPermission === 'denied' && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
                Notifications are blocked by the browser. To re-enable, click the lock icon in the address bar and allow notifications for this site.
              </div>
            )}
          </div>
        </section>

        {/* Voice Calls */}
        <section className="mb-8 p-6 bg-mc-bg-secondary border border-mc-border rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <Phone className="w-5 h-5 text-mc-accent" />
            <h2 className="text-xl font-semibold text-mc-text">Voice Calls</h2>
          </div>
          <p className="text-sm text-mc-text-secondary mb-4">
            Configure voice call settings for the OpenClaw voice-call plugin.
            Requires the plugin to be installed: <code className="px-1 py-0.5 bg-mc-bg rounded text-xs">openclaw plugins install @openclaw/voice-call</code>
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-mc-text mb-2">
                Default From Number
              </label>
              <input
                type="tel"
                value={voiceDefaultNumber}
                onChange={(e) => {
                  setVoiceDefaultNumber(e.target.value);
                  localStorage.setItem('mc-voice-default-number', e.target.value);
                }}
                placeholder="+1 555 000 1234"
                className="w-full px-4 py-2 bg-mc-bg border border-mc-border rounded text-mc-text focus:border-mc-accent focus:outline-none"
              />
              <p className="text-xs text-mc-text-secondary mt-1">
                Default outbound phone number. Set in your OpenClaw voice-call plugin config.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-mc-text mb-2">
                Inbound Call Policy
              </label>
              <select
                value={voiceInboundPolicy}
                onChange={(e) => {
                  setVoiceInboundPolicy(e.target.value);
                  localStorage.setItem('mc-voice-inbound-policy', e.target.value);
                }}
                className="w-full px-4 py-2 bg-mc-bg border border-mc-border rounded text-mc-text focus:border-mc-accent focus:outline-none"
              >
                <option value="block">Block all inbound calls</option>
                <option value="allowlist">Allowlist only (configured in plugin)</option>
                <option value="open">Accept all inbound calls</option>
              </select>
              <p className="text-xs text-mc-text-secondary mt-1">
                Controls who can call your agents. Configure the allowlist in your OpenClaw voice-call plugin config.
              </p>
            </div>
          </div>
        </section>

        {/* Environment Variables Note */}
        <section className="p-6 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <h3 className="text-lg font-semibold text-blue-400 mb-2">
            📝 Environment Variables
          </h3>
          <p className="text-sm text-blue-300 mb-3">
            Some settings are also configurable via environment variables in <code className="px-2 py-1 bg-mc-bg rounded">.env.local</code>:
          </p>
          <ul className="text-sm text-blue-300 space-y-1 ml-4 list-disc">
            <li><code>MISSION_CONTROL_URL</code> - API URL override</li>
            <li><code>WORKSPACE_BASE_PATH</code> - Base workspace directory</li>
            <li><code>PROJECTS_PATH</code> - Projects directory</li>
            <li><code>OPENCLAW_GATEWAY_URL</code> - Gateway WebSocket URL</li>
            <li><code>OPENCLAW_GATEWAY_TOKEN</code> - Gateway auth token</li>
          </ul>
          <p className="text-xs text-blue-400 mt-3">
            Environment variables take precedence over UI settings for server-side operations.
          </p>
        </section>
      </div>
    </div>
  );
}
