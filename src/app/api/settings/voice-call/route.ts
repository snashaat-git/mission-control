import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const OPENCLAW_CONFIG_PATH = path.join(process.env.HOME || '/root', '.openclaw', 'openclaw.json');

function readOpenClawConfig(): any {
  try {
    if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8'));
    }
  } catch { /* ignore */ }
  return null;
}

function writeOpenClawConfig(config: any): void {
  fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

// GET /api/settings/voice-call - Read voice call plugin settings
export async function GET() {
  const config = readOpenClawConfig();
  const voiceConfig = config?.plugins?.entries?.['voice-call']?.config || {};

  return NextResponse.json({
    publicUrl: voiceConfig.publicUrl || '',
    fromNumber: voiceConfig.fromNumber || '',
    inboundPolicy: voiceConfig.inboundPolicy || 'disabled',
    inboundGreeting: voiceConfig.inboundGreeting || '',
    ttsProvider: voiceConfig.tts?.provider || '',
    ttsVoiceId: voiceConfig.tts?.elevenlabs?.voiceId || '',
    provider: voiceConfig.provider || 'mock',
  });
}

// PUT /api/settings/voice-call - Update voice call plugin settings
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const config = readOpenClawConfig();

    if (!config) {
      return NextResponse.json(
        { error: 'openclaw.json not found' },
        { status: 404 }
      );
    }

    // Ensure path exists
    if (!config.plugins) config.plugins = {};
    if (!config.plugins.entries) config.plugins.entries = {};
    if (!config.plugins.entries['voice-call']) config.plugins.entries['voice-call'] = { enabled: true, config: {} };
    if (!config.plugins.entries['voice-call'].config) config.plugins.entries['voice-call'].config = {};

    const vc = config.plugins.entries['voice-call'].config;

    if (body.publicUrl !== undefined) {
      if (body.publicUrl) {
        vc.publicUrl = body.publicUrl;
      } else {
        delete vc.publicUrl;
      }
    }

    if (body.fromNumber !== undefined) {
      vc.fromNumber = body.fromNumber;
    }

    if (body.inboundPolicy !== undefined) {
      vc.inboundPolicy = body.inboundPolicy;
    }

    if (body.inboundGreeting !== undefined) {
      vc.inboundGreeting = body.inboundGreeting;
    }

    writeOpenClawConfig(config);

    return NextResponse.json({ saved: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save' },
      { status: 500 }
    );
  }
}
