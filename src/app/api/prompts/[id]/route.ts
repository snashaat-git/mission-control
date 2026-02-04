import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import type { Prompt } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/prompts/[id] - Get a single prompt
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const prompt = queryOne<Prompt & { agent_name?: string; agent_emoji?: string }>(
      `SELECT p.*, a.name as agent_name, a.avatar_emoji as agent_emoji
       FROM prompts p
       LEFT JOIN agents a ON p.agent_id = a.id
       WHERE p.id = ?`,
      [id]
    );

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
    }

    return NextResponse.json(prompt);
  } catch (error) {
    console.error('Error fetching prompt:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prompt' },
      { status: 500 }
    );
  }
}

// PUT /api/prompts/[id] - Update a prompt
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const existing = queryOne<Prompt>('SELECT * FROM prompts WHERE id = ?', [id]);

    if (!existing) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      title,
      content,
      description,
      category,
      agent_id,
      tags,
      variables,
      is_template,
    } = body;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (content !== undefined) {
      updates.push('content = ?');
      values.push(content);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (category !== undefined) {
      updates.push('category = ?');
      values.push(category);
    }
    if (agent_id !== undefined) {
      updates.push('agent_id = ?');
      values.push(agent_id);
    }
    if (tags !== undefined) {
      updates.push('tags = ?');
      values.push(JSON.stringify(tags));
    }
    if (variables !== undefined) {
      updates.push('variables = ?');
      values.push(JSON.stringify(variables));
    }
    if (is_template !== undefined) {
      updates.push('is_template = ?');
      values.push(is_template ? 1 : 0);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    run(`UPDATE prompts SET ${updates.join(', ')} WHERE id = ?`, values);

    const updated = queryOne<Prompt>('SELECT * FROM prompts WHERE id = ?', [id]);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating prompt:', error);
    return NextResponse.json(
      { error: 'Failed to update prompt' },
      { status: 500 }
    );
  }
}

// DELETE /api/prompts/[id] - Delete a prompt
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const existing = queryOne<Prompt>('SELECT * FROM prompts WHERE id = ?', [id]);

    if (!existing) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
    }

    run('DELETE FROM prompts WHERE id = ?', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting prompt:', error);
    return NextResponse.json(
      { error: 'Failed to delete prompt' },
      { status: 500 }
    );
  }
}

// POST /api/prompts/[id]/use - Increment usage count
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    run(
      'UPDATE prompts SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?',
      [new Date().toISOString(), id]
    );

    const updated = queryOne<Prompt>('SELECT * FROM prompts WHERE id = ?', [id]);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error incrementing usage:', error);
    return NextResponse.json(
      { error: 'Failed to update usage count' },
      { status: 500 }
    );
  }
}
