import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import type { VoiceCall } from '@/lib/types';

interface RouteParams {
  params: Promise<{ callId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { callId } = await params;

    const call = queryOne<VoiceCall>(
      `SELECT cl.*, a.name as agent_name, a.avatar_emoji as agent_emoji
       FROM call_logs cl
       LEFT JOIN agents a ON cl.agent_id = a.id
       WHERE cl.call_id = ?`,
      [callId]
    );

    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    return NextResponse.json(call);
  } catch (error) {
    console.error('[VoiceCall] Failed to get call:', error);
    return NextResponse.json(
      { error: 'Failed to get call' },
      { status: 500 }
    );
  }
}
