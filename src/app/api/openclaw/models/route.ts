import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// GET /api/openclaw/models - Read available models from ~/.openclaw/openclaw.json
export async function GET() {
  try {
    const configPath = path.join(process.env.HOME || '/root', '.openclaw', 'openclaw.json');

    if (!fs.existsSync(configPath)) {
      return NextResponse.json({ models: [], primary: null, error: 'openclaw.json not found' });
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const agentDefaults = config?.agents?.defaults;

    const primary: string | null = agentDefaults?.model?.primary || null;
    const fallbacks: string[] = agentDefaults?.model?.fallbacks || [];
    const modelsMap: Record<string, { alias?: string }> = agentDefaults?.models || {};

    const models = Object.entries(modelsMap).map(([id, meta]) => ({
      id,
      label: (meta as any)?.alias || formatModelLabel(id),
    }));

    return NextResponse.json({ models, primary, fallbacks });
  } catch (error) {
    console.error('Failed to read OpenClaw models:', error);
    return NextResponse.json(
      { models: [], primary: null, error: 'Failed to read openclaw.json' },
      { status: 500 }
    );
  }
}

/** Convert model ID like "ollama/kimi-k2.5:cloud" into a readable label */
function formatModelLabel(id: string): string {
  // Split provider/model:variant
  const parts = id.split('/');
  const provider = parts[0];
  const modelPart = parts.slice(1).join('/');

  // Clean up the model name
  const name = modelPart
    .replace(/:latest$/, '')
    .replace(/:cloud$/, ' (Cloud)')
    .replace(/:free$/, ' (Free)')
    .replace(/-preview$/, ' Preview')
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1);
  return `${name} (${providerLabel})`;
}
