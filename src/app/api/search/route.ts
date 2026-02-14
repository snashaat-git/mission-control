import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';
import type { Task, Agent } from '@/lib/types';

// GET /api/search?q=<query>&limit=20
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

    if (!query) {
      return NextResponse.json({ tasks: [], agents: [] });
    }

    // Sanitize query for FTS5: escape double quotes and wrap terms
    const ftsQuery = query
      .replace(/"/g, '""')
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term}"*`)
      .join(' ');

    // Search tasks via FTS5
    let tasks: Task[] = [];
    try {
      tasks = queryAll<Task>(
        `SELECT t.*,
          aa.name as assigned_agent_name,
          aa.avatar_emoji as assigned_agent_emoji,
          rank
        FROM tasks_fts
        JOIN tasks t ON tasks_fts.rowid = t.rowid
        LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
        WHERE tasks_fts MATCH ?
        ORDER BY rank
        LIMIT ?`,
        [ftsQuery, limit]
      );
    } catch (ftsError) {
      // Fallback to LIKE if FTS5 query fails (e.g. special characters)
      const likePattern = `%${query}%`;
      tasks = queryAll<Task>(
        `SELECT t.*,
          aa.name as assigned_agent_name,
          aa.avatar_emoji as assigned_agent_emoji
        FROM tasks t
        LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
        WHERE t.title LIKE ? OR t.description LIKE ?
        ORDER BY t.updated_at DESC
        LIMIT ?`,
        [likePattern, likePattern, limit]
      );
    }

    // Search agents via LIKE (small table, no FTS needed)
    const likePattern = `%${query}%`;
    const agents = queryAll<Agent>(
      `SELECT * FROM agents
       WHERE name LIKE ? OR role LIKE ? OR description LIKE ?
       LIMIT 10`,
      [likePattern, likePattern, likePattern]
    );

    return NextResponse.json({ tasks, agents });
  } catch (error) {
    console.error('Search failed:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
