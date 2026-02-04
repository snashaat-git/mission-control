import { NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { getDb } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/openclaw/sessions/[id]/history - Get conversation history
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const client = getOpenClawClient();

    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch {
        return NextResponse.json(
          { error: 'Failed to connect to OpenClaw Gateway' },
          { status: 503 }
        );
      }
    }

    // Look up the Mission Control session to find the agent's session_key
    const db = getDb();
    const mcSession = db.prepare(
      `SELECT s.*, a.session_key as agent_session_key 
       FROM openclaw_sessions s 
       LEFT JOIN agents a ON s.agent_id = a.id 
       WHERE s.openclaw_session_id = ? OR s.id = ?`
    ).get(id, id) as any;

    // Use agent's session_key or fallback to the internal ID
    const targetSessionKey = mcSession?.agent_session_key || mcSession?.openclaw_session_id || id;

    // Use chat.history instead of sessions.history (which doesn't exist)
    const history = await client.call('chat.history', { sessionKey: targetSessionKey, limit: 50 });
    return NextResponse.json({ history });
  } catch (error) {
    console.error('Failed to get OpenClaw session history:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
