// API endpoint to check Antigravity task status and artifacts
// GET /api/agents/antigravity/status/[taskId]

import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/db';
import type { AntigravityTask } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;

    if (!taskId) {
      return NextResponse.json(
        { error: 'taskId is required' },
        { status: 400 }
      );
    }

    // Get the Antigravity task
    const agTask = queryOne<{
      id: string;
      task_id: string;
      workspace_url?: string;
      workspace_name: string;
      status: string;
      prompt: string;
      expected_artifacts: string;
      artifacts: string;
      output_dir?: string;
      error_message?: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM antigravity_tasks WHERE task_id = ? ORDER BY created_at DESC LIMIT 1`,
      [taskId]
    );

    if (!agTask) {
      return NextResponse.json(
        { error: 'No Antigravity task found for this task ID' },
        { status: 404 }
      );
    }

    // Parse artifacts
    const artifacts = JSON.parse(agTask.artifacts || '[]') as { type: string; name: string; url?: string; local_path?: string; downloaded: boolean; created_at: string }[];
    const expectedArtifacts = JSON.parse(agTask.expected_artifacts || '[]') as string[];

    return NextResponse.json({
      task_id: taskId,
      antigravity_task_id: agTask.id,
      status: agTask.status,
      workspace: {
        name: agTask.workspace_name,
        url: agTask.workspace_url,
      },
      progress: {
        expected_artifacts: expectedArtifacts,
        found_artifacts: artifacts.length,
        artifacts: artifacts,
      },
      output_dir: agTask.output_dir,
      error_message: agTask.error_message,
      created_at: agTask.created_at,
      updated_at: agTask.updated_at,
    });

  } catch (error) {
    console.error('Error fetching Antigravity status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch status', details: (error as Error).message },
      { status: 500 }
    );
  }
}
