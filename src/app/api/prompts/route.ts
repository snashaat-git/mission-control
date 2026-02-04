import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { queryAll, queryOne, run } from '@/lib/db';
import type { Prompt } from '@/lib/types';

// GET /api/prompts - List all prompts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const agentId = searchParams.get('agent_id');
    const search = searchParams.get('search');

    let sql = `
      SELECT p.*, a.name as agent_name, a.avatar_emoji as agent_emoji
      FROM prompts p
      LEFT JOIN agents a ON p.agent_id = a.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (category) {
      sql += ' AND p.category = ?';
      params.push(category);
    }

    if (agentId) {
      sql += ' AND p.agent_id = ?';
      params.push(agentId);
    }

    if (search) {
      sql += ' AND (p.title LIKE ? OR p.content LIKE ? OR p.description LIKE ?)';
      const likeTerm = `%${search}%`;
      params.push(likeTerm, likeTerm, likeTerm);
    }

    sql += ' ORDER BY p.updated_at DESC';

    const prompts = queryAll<Prompt & { agent_name?: string; agent_emoji?: string }>(sql, params);

    return NextResponse.json(prompts);
  } catch (error) {
    console.error('Error fetching prompts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prompts' },
      { status: 500 }
    );
  }
}

// POST /api/prompts - Create a new prompt
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      content,
      description,
      category = 'general',
      agent_id,
      tags,
      variables,
      is_template = false,
    } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: 'Title and content are required' },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    run(
      `INSERT INTO prompts (id, title, content, description, category, agent_id, tags, variables, is_template, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        title,
        content,
        description || null,
        category,
        agent_id || null,
        tags ? JSON.stringify(tags) : null,
        variables ? JSON.stringify(variables) : null,
        is_template ? 1 : 0,
        now,
        now,
      ]
    );

    const prompt = queryOne<Prompt>(
      'SELECT * FROM prompts WHERE id = ?',
      [id]
    );

    return NextResponse.json(prompt, { status: 201 });
  } catch (error) {
    console.error('Error creating prompt:', error);
    return NextResponse.json(
      { error: 'Failed to create prompt' },
      { status: 500 }
    );
  }
}
