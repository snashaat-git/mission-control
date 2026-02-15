import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { run, queryOne } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';
import type { VoiceCall } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { agentId, phoneNumber, message, mode } = await request.json();

    if (!phoneNumber || !message) {
      return NextResponse.json(
        { error: 'phoneNumber and message are required' },
        { status: 400 }
      );
    }

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }

    // Initiate call via OpenClaw Gateway
    const result = await client.initiateCall({
      message,
      to: phoneNumber,
      mode: mode || 'conversation',
    });

    console.log('[VoiceCall] Gateway response:', JSON.stringify(result));

    // Extract callId from response — gateway may return different shapes
    const callId = (result as any)?.callId
      || (result as any)?.call_id
      || (result as any)?.sid
      || (result as any)?.callSid
      || (result as any)?.id
      || crypto.randomUUID();

    // Determine session key from agent or fallback
    let sessionKey = 'agent:main:main';
    if (agentId) {
      const agent = queryOne<{ session_key: string }>(
        'SELECT session_key FROM agents WHERE id = ?',
        [agentId]
      );
      if (agent?.session_key) {
        sessionKey = agent.session_key;
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    run(
      `INSERT INTO call_logs (id, agent_id, session_key, call_id, phone_number, direction, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'outbound', 'initiating', ?)`,
      [id, agentId || null, sessionKey, callId, phoneNumber, now]
    );

    const callLog: VoiceCall = {
      id,
      agent_id: agentId || undefined,
      session_key: sessionKey,
      call_id: callId,
      phone_number: phoneNumber,
      direction: 'outbound',
      status: 'initiating',
      duration_seconds: 0,
      created_at: now,
    };

    broadcast({ type: 'call_started', payload: callLog as any });

    return NextResponse.json(callLog, { status: 201 });
  } catch (error) {
    console.error('[VoiceCall] Failed to initiate call:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initiate call' },
      { status: 500 }
    );
  }
}
