import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';

interface RouteParams {
  params: Promise<{ callId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { callId } = await params;
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const call = queryOne<{ call_id: string; status: string }>(
      'SELECT call_id, status FROM call_logs WHERE call_id = ?',
      [callId]
    );

    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    if (call.status !== 'active' && call.status !== 'initiating') {
      return NextResponse.json({ error: 'Call is not active' }, { status: 400 });
    }

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }

    await client.continueCall(callId, message);

    // Update status to active if still initiating
    if (call.status === 'initiating') {
      run('UPDATE call_logs SET status = ? WHERE call_id = ?', ['active', callId]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[VoiceCall] Failed to continue call:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to continue call' },
      { status: 500 }
    );
  }
}
