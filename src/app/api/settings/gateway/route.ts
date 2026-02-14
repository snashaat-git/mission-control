import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resetOpenClawClient, getOpenClawClient } from '@/lib/openclaw/client';

const ENV_LOCAL_PATH = path.join(process.cwd(), '.env.local');
const OPENCLAW_CONFIG_PATH = path.join(process.env.HOME || '/root', '.openclaw', 'openclaw.json');

interface GatewaySettings {
  gatewayUrl: string;
  gatewayToken: string;
  // Read-only: auto-detected sources
  autoDetected: {
    openclawJsonToken: boolean;
    deviceIdentity: boolean;
  };
}

function readEnvLocal(): Record<string, string> {
  const vars: Record<string, string> = {};
  try {
    if (fs.existsSync(ENV_LOCAL_PATH)) {
      const content = fs.readFileSync(ENV_LOCAL_PATH, 'utf-8');
      for (const line of content.split('\n')) {
        const match = line.match(/^([A-Z_]+)=(.*)$/);
        if (match) {
          vars[match[1]] = match[2].trim();
        }
      }
    }
  } catch {
    // ignore
  }
  return vars;
}

function writeEnvLocal(vars: Record<string, string>): void {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(vars)) {
    lines.push(`${key}=${value}`);
  }
  fs.writeFileSync(ENV_LOCAL_PATH, lines.join('\n') + '\n', 'utf-8');
}

// GET /api/settings/gateway - Read current gateway settings
export async function GET() {
  const envVars = readEnvLocal();

  // Check for auto-detected sources
  let openclawJsonToken = false;
  try {
    if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8'));
      openclawJsonToken = Boolean(config?.gateway?.auth?.token);
    }
  } catch { /* ignore */ }

  const deviceIdentityPath = path.join(process.env.HOME || '/root', '.openclaw', 'identity', 'device.json');
  const deviceIdentity = fs.existsSync(deviceIdentityPath);

  const settings: GatewaySettings = {
    gatewayUrl: envVars.OPENCLAW_GATEWAY_URL || process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
    gatewayToken: envVars.OPENCLAW_GATEWAY_TOKEN || '',
    autoDetected: {
      openclawJsonToken,
      deviceIdentity,
    },
  };

  return NextResponse.json(settings);
}

// PUT /api/settings/gateway - Update gateway settings and reconnect
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { gatewayUrl, gatewayToken } = body as { gatewayUrl?: string; gatewayToken?: string };

    // Read existing .env.local vars so we don't clobber other settings
    const envVars = readEnvLocal();

    if (gatewayUrl !== undefined) {
      if (gatewayUrl && gatewayUrl !== 'ws://127.0.0.1:18789') {
        envVars.OPENCLAW_GATEWAY_URL = gatewayUrl;
        process.env.OPENCLAW_GATEWAY_URL = gatewayUrl;
      } else {
        delete envVars.OPENCLAW_GATEWAY_URL;
        delete process.env.OPENCLAW_GATEWAY_URL;
      }
    }

    if (gatewayToken !== undefined) {
      if (gatewayToken) {
        envVars.OPENCLAW_GATEWAY_TOKEN = gatewayToken;
        process.env.OPENCLAW_GATEWAY_TOKEN = gatewayToken;
      } else {
        delete envVars.OPENCLAW_GATEWAY_TOKEN;
        delete process.env.OPENCLAW_GATEWAY_TOKEN;
      }
    }

    // Write updated .env.local
    if (Object.keys(envVars).length > 0) {
      writeEnvLocal(envVars);
    } else if (fs.existsSync(ENV_LOCAL_PATH)) {
      fs.unlinkSync(ENV_LOCAL_PATH);
    }

    // Reset the client so it reconnects with new settings
    resetOpenClawClient();

    // Try to connect with new settings
    const client = getOpenClawClient();
    let connected = false;
    let error: string | null = null;
    try {
      await client.connect();
      connected = client.isConnected();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Connection failed';
    }

    return NextResponse.json({
      saved: true,
      connected,
      error,
    });
  } catch (err) {
    return NextResponse.json(
      { saved: false, error: err instanceof Error ? err.message : 'Failed to save settings' },
      { status: 500 }
    );
  }
}
