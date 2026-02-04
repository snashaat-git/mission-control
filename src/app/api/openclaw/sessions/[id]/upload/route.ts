import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import path from 'path';
import { queryOne, run } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import type { Agent } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/openclaw/sessions/[id]/upload - Upload a file and send message
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const message = formData.get('message') as string | null;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Look up the Mission Control session to find the agent and task
    const mcSession = queryOne<{ 
      agent_id: string; 
      task_id: string | null;
      openclaw_session_id: string;
    }>(
      `SELECT s.agent_id, s.task_id, s.openclaw_session_id, a.session_key 
       FROM openclaw_sessions s 
       LEFT JOIN agents a ON s.agent_id = a.id 
       WHERE s.openclaw_session_id = ? OR s.id = ?`,
      [id, id]
    );

    if (!mcSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Get agent details
    const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [mcSession.agent_id]);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Determine target directory
    let targetDir: string;
    if (mcSession.task_id) {
      // Get task's output directory
      const task = queryOne<{ output_dir: string | null; title: string }>(
        'SELECT output_dir, title FROM tasks WHERE id = ?',
        [mcSession.task_id]
      );
      if (task?.output_dir) {
        targetDir = task.output_dir.replace(/^~\//, process.env.HOME || '/Users/snashaat');
      } else {
        // Fallback to auto-generated path
        const safeTitle = task?.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'uploads';
        targetDir = path.join(process.env.HOME || '/Users/snashaat', '.openclaw', 'workspace', 'projects', safeTitle);
      }
    } else {
      // No task - use agent-specific folder
      targetDir = path.join(process.env.HOME || '/Users/snashaat', '.openclaw', 'workspace', 'uploads', agent.name.toLowerCase().replace(/\s+/g, '-'));
    }

    // Ensure directory exists
    await fs.mkdir(targetDir, { recursive: true });

    // Save file
    const fileExt = path.extname(file.name);
    const fileName = `${Date.now()}-${uuidv4().slice(0, 8)}${fileExt}`;
    const filePath = path.join(targetDir, fileName);
    
    const bytes = await file.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(bytes));

    // Build message with file info
    const fileSize = (bytes.byteLength / 1024).toFixed(1);
    const messageText = message?.trim() 
      ? `[Mission Control] ${message}\n\nFile: ${file.name} (${fileSize}KB)\nPath: ${filePath}`
      : `[Mission Control] File uploaded: ${file.name} (${fileSize}KB)\nPath: ${filePath}`;

    // Send to OpenClaw
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }

    const targetSessionKey = agent.session_key || mcSession.openclaw_session_id;
    await client.sendMessage(targetSessionKey, messageText);

    // Register as deliverable if there's a task
    if (mcSession.task_id) {
      const existingDel = queryOne<{ c: number }>(
        'SELECT COUNT(1) as c FROM task_deliverables WHERE task_id = ? AND path = ?',
        [mcSession.task_id, filePath]
      );
      if (!existingDel || existingDel.c === 0) {
        run(
          `INSERT INTO task_deliverables (id, task_id, deliverable_type, title, path, description, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), mcSession.task_id, 'file', file.name, filePath, `Uploaded via chat (${fileSize}KB)`, new Date().toISOString()]
        );
      }
    }

    return NextResponse.json({ 
      success: true, 
      fileName: file.name,
      filePath,
      fileSize: `${fileSize}KB`
    });

  } catch (error) {
    console.error('Failed to upload file:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
