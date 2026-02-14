// OpenClaw Gateway WebSocket Client

import { EventEmitter } from 'events';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { OpenClawMessage, OpenClawSessionInfo } from '../types';

// Load device identity from ~/.openclaw/identity/
interface DeviceIdentity {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

interface DeviceAuth {
  deviceId: string;
  tokens: Record<string, { token: string; role: string; scopes: string[] }>;
}

function loadDeviceIdentity(): { identity: DeviceIdentity | null; auth: DeviceAuth | null; gatewayToken: string | null } {
  const openclawBase = path.join(process.env.HOME || '/root', '.openclaw');
  const openclawDir = path.join(openclawBase, 'identity');
  try {
    const identityPath = path.join(openclawDir, 'device.json');
    const authPath = path.join(openclawDir, 'device-auth.json');
    const configPath = path.join(openclawBase, 'openclaw.json');

    const identity = fs.existsSync(identityPath)
      ? JSON.parse(fs.readFileSync(identityPath, 'utf-8')) as DeviceIdentity
      : null;

    const auth = fs.existsSync(authPath)
      ? JSON.parse(fs.readFileSync(authPath, 'utf-8')) as DeviceAuth
      : null;

    // Read the gateway auth token from openclaw.json
    let gatewayToken: string | null = null;
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      gatewayToken = config?.gateway?.auth?.token || null;
      if (gatewayToken) {
        console.log('[OpenClaw Client] Loaded gateway auth token from openclaw.json');
      }
    }

    if (identity) {
      console.log('[OpenClaw Client] Loaded device identity:', identity.deviceId.slice(0, 12) + '...');
    }

    return { identity, auth, gatewayToken };
  } catch (error) {
    console.warn('[OpenClaw Client] Could not load device identity:', error);
    return { identity: null, auth: null, gatewayToken: null };
  }
}

// Helper to load env vars from .env.local if not already set
function loadEnvLocal(): void {
  if (process.env.OPENCLAW_GATEWAY_TOKEN) return; // Already set, skip

  try {
    const possiblePaths = [
      path.join(process.cwd(), '.env.local'),
      path.join(process.cwd(), '..', '.env.local'),
      path.join(process.cwd(), '..', '..', '.env.local'),
      path.join(process.cwd(), '..', '..', '..', '.env.local'),
    ];

    for (const envPath of possiblePaths) {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          const match = line.match(/^OPENCLAW_GATEWAY_(\w+)=(.+)$/);
          if (match) {
            const key = `OPENCLAW_GATEWAY_${match[1]}`;
            const value = match[2].trim();
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
        console.log('[OpenClaw Client] Loaded env vars from:', envPath);
        break;
      }
    }
  } catch (error) {
    console.warn('[OpenClaw Client] Could not load .env.local:', error);
  }
}

// Load env on module init
loadEnvLocal();

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';
const DEVICE_INFO = loadDeviceIdentity();

// Derive effective token: prefer env var, fall back to gateway config token
const EFFECTIVE_TOKEN = GATEWAY_TOKEN || DEVICE_INFO.gatewayToken || '';

if (EFFECTIVE_TOKEN) {
  console.log('[OpenClaw Client] Using token (length:', EFFECTIVE_TOKEN.length, ')');
} else {
  console.warn('[OpenClaw Client] WARNING: No gateway token found! Auth will fail.');
}

export class OpenClawClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageId = 0;
  private pendingRequests = new Map<string | number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private connected = false;
  private authenticated = false; // Track auth state separately from connection state
  private connecting: Promise<void> | null = null; // Lock to prevent multiple simultaneous connection attempts
  private autoReconnect = true;
  private gatewayToken: string; // Token for URL auth (gateway door)
  private operatorToken: string; // Token for connect request (scoped permissions)

  constructor(private url: string = GATEWAY_URL, token?: string) {
    super();
    // Use a single token: gateway auth token for both URL and connect request
    this.gatewayToken = token ?? EFFECTIVE_TOKEN;
    this.operatorToken = this.gatewayToken;
    // Prevent Node.js from throwing on unhandled 'error' events
    this.on('error', () => {});
  }

  async connect(): Promise<void> {
    // If already connected, return immediately
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    // If a connection attempt is already in progress, wait for it
    if (this.connecting) {
      return this.connecting;
    }

    // Create a new connection attempt
    this.connecting = new Promise((resolve, reject) => {
      try {
        // Clean up any existing connection
        if (this.ws) {
          this.ws.onclose = null;
          this.ws.onerror = null;
          this.ws.onmessage = null;
          this.ws.onopen = null;
          if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.close();
          }
          this.ws = null;
        }

        // Add gateway token to URL query string for Gateway authentication
        const wsUrl = new URL(this.url);
        if (this.gatewayToken) {
          wsUrl.searchParams.set('token', this.gatewayToken);
        }
        console.log('[OpenClaw] Connecting to:', wsUrl.toString().replace(/token=[^&]+/, 'token=***'));
        console.log('[OpenClaw] Token in URL:', wsUrl.searchParams.has('token'));
        this.ws = new WebSocket(wsUrl.toString());

        const connectionTimeout = setTimeout(() => {
          if (!this.connected) {
            this.ws?.close();
            reject(new Error('Connection timeout'));
          }
        }, 10000); // 10 second connection timeout

        this.ws.onopen = async () => {
          clearTimeout(connectionTimeout);
          console.log('[OpenClaw] WebSocket opened, waiting for challenge...');
          // Don't send anything yet - wait for Gateway challenge
          // Token is in URL query string
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          const wasConnected = this.connected;
          this.connected = false;
          this.authenticated = false;
          this.connecting = null;
          this.emit('disconnected');
          // Log close reason for debugging
          console.log(`[OpenClaw] Disconnected from Gateway (code: ${event.code}, reason: "${event.reason}", wasClean: ${event.wasClean})`);
          // Only auto-reconnect if we were previously connected (not on initial connection failure)
          if (this.autoReconnect && wasConnected) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout);
          console.error('[OpenClaw] WebSocket error');
          this.emit('error', error);
          if (!this.connected) {
            this.connecting = null;
            reject(new Error('Failed to connect to OpenClaw Gateway'));
          }
        };

        this.ws.onmessage = (event) => {
          console.log('[OpenClaw] Received:', event.data);
          try {
            const data = JSON.parse(event.data as string);

            // Handle challenge-response authentication (OpenClaw RequestFrame format)
            if (data.type === 'event' && data.event === 'connect.challenge') {
              console.log('[OpenClaw] Challenge received, responding...');
              const requestId = crypto.randomUUID();
              const nonce = data.payload?.nonce as string | undefined;
              const scopes = ['operator.admin', 'operator.read', 'operator.write', 'operator.approvals', 'operator.pairing'];

              // Build device auth if identity is available
              let device: Record<string, unknown> | undefined;
              if (DEVICE_INFO.identity) {
                const signedAtMs = Date.now();
                const payloadVersion = nonce ? 'v2' : 'v1';
                const payloadParts = [
                  payloadVersion,
                  DEVICE_INFO.identity.deviceId,
                  'gateway-client',    // clientId
                  'backend',           // clientMode
                  'operator',          // role
                  scopes.join(','),    // scopes
                  String(signedAtMs),  // signedAtMs
                  this.gatewayToken,   // token
                ];
                if (payloadVersion === 'v2') payloadParts.push(nonce ?? '');
                const payload = payloadParts.join('|');

                // Sign with Ed25519 private key
                const privateKey = crypto.createPrivateKey(DEVICE_INFO.identity.privateKeyPem);
                const signatureBuf = crypto.sign(null, Buffer.from(payload, 'utf8'), privateKey);
                const signatureB64Url = signatureBuf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');

                // Derive raw public key (base64url encoded)
                const spki = crypto.createPublicKey(DEVICE_INFO.identity.publicKeyPem).export({ type: 'spki', format: 'der' });
                const ED25519_SPKI_PREFIX_LEN = 12; // standard ASN.1 prefix for Ed25519
                const rawKey = spki.subarray(ED25519_SPKI_PREFIX_LEN);
                const publicKeyB64Url = rawKey.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');

                device = {
                  id: DEVICE_INFO.identity.deviceId,
                  publicKey: publicKeyB64Url,
                  signature: signatureB64Url,
                  signedAt: signedAtMs,
                  nonce,
                };
                console.log('[OpenClaw] Device auth prepared, deviceId:', DEVICE_INFO.identity.deviceId.slice(0, 12) + '...');
              }

              const response = {
                type: 'req',
                id: requestId,
                method: 'connect',
                params: {
                  minProtocol: 3,
                  maxProtocol: 3,
                  client: {
                    id: 'gateway-client',
                    version: '1.0.0',
                    platform: process.platform,
                    mode: 'backend'
                  },
                  auth: {
                    token: this.gatewayToken
                  },
                  role: 'operator',
                  scopes,
                  device,
                }
              };

              // Set up response handler
              this.pendingRequests.set(requestId, {
                resolve: (payload?: unknown) => {
                  this.connected = true;
                  this.authenticated = true;
                  this.connecting = null;
                  this.emit('connected');
                  console.log('[OpenClaw] Authenticated successfully');
                  try {
                    // Log available Gateway methods once for debugging
                    const p: any = payload;
                    const methods = p?.features?.methods;
                    if (Array.isArray(methods)) {
                      console.log('[OpenClaw] Available methods:', methods);
                    } else {
                      console.log('[OpenClaw] Auth payload keys:', p && typeof p === 'object' ? Object.keys(p) : typeof p);
                    }
                  } catch {}
                  resolve();
                },
                reject: (error: Error) => {
                  this.connecting = null;
                  this.ws?.close();
                  reject(new Error(`Authentication failed: ${error.message}`));
                }
              });

              console.log('[OpenClaw] Sending challenge response');
              this.ws!.send(JSON.stringify(response));
              return;
            }

            // Handle RPC responses and other messages
            this.handleMessage(data as OpenClawMessage);
          } catch (err) {
            console.error('[OpenClaw] Failed to parse message:', err);
          }
        };
      } catch (err) {
        this.connecting = null;
        reject(err);
      }
    });

    return this.connecting;
  }

  private handleMessage(data: OpenClawMessage & { type?: string; ok?: boolean; payload?: unknown }): void {
    // Handle OpenClaw ResponseFrame format (type: "res")
    if (data.type === 'res' && data.id !== undefined) {
      const requestId = data.id as string | number;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        const { resolve, reject } = pending;
        this.pendingRequests.delete(requestId);

        if (data.ok === false && data.error) {
          reject(new Error(data.error.message));
        } else {
          resolve(data.payload);
        }
        return;
      }
    }

    // Handle legacy JSON-RPC responses
    const legacyId = data.id as string | number | undefined;
    if (legacyId !== undefined && this.pendingRequests.has(legacyId)) {
      const { resolve, reject } = this.pendingRequests.get(legacyId)!;
      this.pendingRequests.delete(legacyId);

      if (data.error) {
        reject(new Error(data.error.message));
      } else {
        resolve(data.result);
      }
      return;
    }

    // Handle events/notifications
    if (data.method) {
      this.emit('notification', data);
      this.emit(data.method, data.params);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.autoReconnect) return;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.autoReconnect) return;

      console.log('[OpenClaw] Attempting reconnect...');
      try {
        await this.connect();
      } catch {
        // Don't spam logs on reconnect failure, just schedule another attempt
        this.scheduleReconnect();
      }
    }, 10000); // 10 seconds between reconnect attempts
  }

  async call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.ws || !this.connected || !this.authenticated) {
      throw new Error('Not connected to OpenClaw Gateway');
    }

    const id = crypto.randomUUID();
    const message = { type: 'req', id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);

      this.ws!.send(JSON.stringify(message));
    });
  }

  // Session management methods
  async listSessions(): Promise<OpenClawSessionInfo[]> {
    return this.call<OpenClawSessionInfo[]>('sessions.list');
  }

  async getSessionHistory(sessionId: string): Promise<unknown[]> {
    return this.call<unknown[]>('sessions.history', { session_id: sessionId });
  }

  async sendMessage(sessionKey: string, message: string): Promise<void> {
    // OpenClaw Gateway method names vary across versions.
    // Try the modern tool-style method first, then fall back.
    const attempts: Array<{ method: string; params: Record<string, unknown> }> = [
      // OpenClaw Gateway (protocol 3): chat.send requires message (string) + idempotencyKey
      {
        method: 'chat.send',
        params: {
          sessionKey,
          idempotencyKey: crypto.randomUUID(),
          message,
        },
      },
      // Fallback seen in some builds
      {
        method: 'chat.send',
        params: {
          sessionKey,
          idempotencyKey: crypto.randomUUID(),
          content: message,
        },
      },
    ];

    let lastErr: unknown;
    for (const a of attempts) {
      try {
        console.log('[OpenClaw] sendMessage trying', a.method, a.params);
        await this.call(a.method, a.params);
        console.log('[OpenClaw] sendMessage OK via', a.method);
        return;
      } catch (err) {
        console.warn('[OpenClaw] sendMessage failed via', a.method, err instanceof Error ? err.message : err);
        lastErr = err;
      }
    }

    throw lastErr instanceof Error ? lastErr : new Error('Failed to send message');
  }

  async createSession(channel: string, peer?: string): Promise<OpenClawSessionInfo> {
    return this.call<OpenClawSessionInfo>('sessions.create', { channel, peer });
  }

  // Node methods (device capabilities)
  async listNodes(): Promise<unknown[]> {
    return this.call<unknown[]>('node.list');
  }

  async describeNode(nodeId: string): Promise<unknown> {
    return this.call('node.describe', { node_id: nodeId });
  }

  disconnect(): void {
    this.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect on intentional close
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.authenticated = false;
    this.connecting = null;
  }

  isConnected(): boolean {
    return this.connected && this.authenticated && this.ws?.readyState === WebSocket.OPEN;
  }

  setAutoReconnect(enabled: boolean): void {
    this.autoReconnect = enabled;
    if (!enabled && this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// Singleton instance for server-side usage
let clientInstance: OpenClawClient | null = null;

export function getOpenClawClient(): OpenClawClient {
  if (!clientInstance) {
    clientInstance = new OpenClawClient();
  }
  return clientInstance;
}

/**
 * Reset the singleton client (e.g., after settings change).
 * Disconnects the existing client and creates a fresh one on next getOpenClawClient() call.
 */
export function resetOpenClawClient(): void {
  if (clientInstance) {
    clientInstance.disconnect();
    clientInstance = null;
  }
  // Re-read env vars (in case .env.local was updated)
  loadEnvLocal();
  // Reload device identity and gateway token
  Object.assign(DEVICE_INFO, loadDeviceIdentity());
}
