import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';
import type { VoiceCall } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');

    let sql = `
      SELECT cl.*, a.name as agent_name, a.avatar_emoji as agent_emoji
      FROM call_logs cl
      LEFT JOIN agents a ON cl.agent_id = a.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (agentId) {
      sql += ' AND cl.agent_id = ?';
      params.push(agentId);
    }

    if (status) {
      sql += ' AND cl.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY cl.created_at DESC LIMIT ?';
    params.push(limit);

    const calls = queryAll<VoiceCall>(sql, params);

    return NextResponse.json(calls);
  } catch (error) {
    console.error('[VoiceCall] Failed to list calls:', error);
    return NextResponse.json(
      { error: 'Failed to list calls' },
      { status: 500 }
    );
  }
}
