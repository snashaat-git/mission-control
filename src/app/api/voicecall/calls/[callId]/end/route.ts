import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';

interface RouteParams {
  params: Promise<{ callId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { callId } = await params;

    const call = queryOne<{ id: string; call_id: string; status: string; created_at: string }>(
      'SELECT id, call_id, status, created_at FROM call_logs WHERE call_id = ?',
      [callId]
    );

    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    if (call.status === 'ended' || call.status === 'failed') {
      return NextResponse.json({ error: 'Call already ended' }, { status: 400 });
    }

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }

    await client.endCall(callId);

    const now = new Date().toISOString();
    const startTime = new Date(call.created_at).getTime();
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);

    run(
      'UPDATE call_logs SET status = ?, ended_at = ?, duration_seconds = ? WHERE call_id = ?',
      ['ended', now, durationSeconds, callId]
    );

    broadcast({
      type: 'call_ended',
      payload: { callId, duration: durationSeconds } as any,
    });

    return NextResponse.json({ success: true, duration: durationSeconds });
  } catch (error) {
    console.error('[VoiceCall] Failed to end call:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to end call' },
      { status: 500 }
    );
  }
}
