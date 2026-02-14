import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';

interface RouteParams {
  params: Promise<{ callId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { callId } = await params;

    const call = queryOne<{ id: string; call_id: string; status: string; created_at: string }>(
      'SELECT id, call_id, status, created_at FROM call_logs WHERE call_id = ?',
      [callId]
    );

    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    // If call is still active, poll gateway for latest status
    if (call.status === 'active' || call.status === 'initiating') {
      try {
        const client = getOpenClawClient();
        if (client.isConnected()) {
          const gatewayStatus = await client.getCallStatus(callId);

          // Sync status from gateway
          if (gatewayStatus.status === 'ended' || gatewayStatus.status === 'failed') {
            const now = new Date().toISOString();
            const durationSeconds = gatewayStatus.duration ||
              Math.round((Date.now() - new Date(call.created_at).getTime()) / 1000);

            run(
              'UPDATE call_logs SET status = ?, ended_at = ?, duration_seconds = ?, transcript = COALESCE(?, transcript) WHERE call_id = ?',
              [gatewayStatus.status, now, durationSeconds, gatewayStatus.transcript || null, callId]
            );

            broadcast({
              type: gatewayStatus.status === 'failed' ? 'call_failed' : 'call_ended',
              payload: { callId, duration: durationSeconds } as any,
            });
          } else if (gatewayStatus.status === 'active' && call.status === 'initiating') {
            run('UPDATE call_logs SET status = ? WHERE call_id = ?', ['active', callId]);
          }

          // Return fresh data
          if (gatewayStatus.transcript) {
            run('UPDATE call_logs SET transcript = ? WHERE call_id = ?', [gatewayStatus.transcript, callId]);
          }
        }
      } catch {
        // Gateway unavailable, return DB state
      }
    }

    // Re-fetch with joined agent data
    const updated = queryOne(
      `SELECT cl.*, a.name as agent_name, a.avatar_emoji as agent_emoji
       FROM call_logs cl
       LEFT JOIN agents a ON cl.agent_id = a.id
       WHERE cl.call_id = ?`,
      [callId]
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[VoiceCall] Failed to get call status:', error);
    return NextResponse.json(
      { error: 'Failed to get call status' },
      { status: 500 }
    );
  }
}
