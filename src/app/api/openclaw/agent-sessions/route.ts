import { NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';
import type { OpenClawSession } from '@/lib/types';

// GET /api/openclaw/agent-sessions - Get all agent-to-session mappings
export async function GET() {
  try {
    const sessions = queryAll<OpenClawSession>(
      'SELECT * FROM openclaw_sessions WHERE status = ?',
      ['active']
    );

    // Build agent_id -> session mapping
    const mapping: Record<string, OpenClawSession> = {};
    for (const session of sessions) {
      if (session.agent_id) {
        mapping[session.agent_id] = session;
      }
    }

    return NextResponse.json({ mapping });
  } catch (error) {
    console.error('Failed to fetch agent sessions:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
