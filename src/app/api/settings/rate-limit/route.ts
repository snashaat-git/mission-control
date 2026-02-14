import { NextRequest, NextResponse } from 'next/server';
import { getAllConfigs, updateAllConfigs } from '@/lib/rate-limit';
import type { RateLimitConfig } from '@/lib/rate-limit';

const TIER_DESCRIPTIONS: Record<string, { label: string; description: string; routes: string }> = {
  strict: {
    label: 'Strict',
    description: 'Expensive operations like search, file upload, prompt enhancement',
    routes: '/api/search, /api/prompts/enhance, /api/workflows, /api/files/upload',
  },
  standard: {
    label: 'Standard',
    description: 'Normal CRUD operations for tasks, agents, conversations',
    routes: '/api/tasks/*, /api/agents/*, /api/conversations/*, /api/prompts/*',
  },
  relaxed: {
    label: 'Relaxed',
    description: 'High-frequency polling endpoints',
    routes: '/api/events, /api/openclaw/status, /api/openclaw/sessions',
  },
};

export async function GET() {
  const configs = getAllConfigs();

  const tiers = Object.entries(configs).map(([key, config]) => ({
    id: key,
    ...TIER_DESCRIPTIONS[key],
    max: config.max,
    windowMs: config.windowMs,
    windowSeconds: config.windowMs / 1000,
  }));

  return NextResponse.json({ tiers });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const updates: Record<string, Partial<RateLimitConfig>> = {};

    for (const tier of body.tiers || []) {
      if (!['strict', 'standard', 'relaxed'].includes(tier.id)) continue;

      const patch: Partial<RateLimitConfig> = {};
      if (typeof tier.max === 'number' && tier.max >= 1 && tier.max <= 10000) {
        patch.max = Math.floor(tier.max);
      }
      if (typeof tier.windowSeconds === 'number' && tier.windowSeconds >= 10 && tier.windowSeconds <= 3600) {
        patch.windowMs = Math.floor(tier.windowSeconds) * 1000;
      }
      if (Object.keys(patch).length > 0) {
        updates[tier.id] = patch;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid updates' }, { status: 400 });
    }

    updateAllConfigs(updates);

    return NextResponse.json({ success: true, ...getAllConfigs() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update' },
      { status: 500 }
    );
  }
}
