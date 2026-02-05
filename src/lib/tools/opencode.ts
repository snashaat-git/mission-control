// OpenCode tool integration for agents
// Provides LSP-powered coding capabilities to Mission Control agents

import { queryOne, run } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export interface OpenCodeToolParams {
  task_id: string;
  prompt: string;
  cwd?: string;
  model?: string;
  title?: string;
  timeout?: number;
}

export interface OpenCodeToolResult {
  success: boolean;
  output: string;
  files_modified: string[];
  error?: string;
  duration: number;
  activity_id?: string;
}

/**
 * Invoke OpenCode CLI for a coding task
 * Logs activity and tracks file changes
 */
export async function invokeOpenCode(params: OpenCodeToolParams): Promise<OpenCodeToolResult> {
  const startTime = Date.now();
  
  try {
    // Get task info for context
    const task = queryOne<{ title: string; output_dir: string | null }>(
      'SELECT title, output_dir FROM tasks WHERE id = ?',
      [params.task_id]
    );
    
    const cwd = params.cwd || task?.output_dir || process.cwd();
    const title = params.title || `Task: ${task?.title || params.task_id}`;
    
    // Log start of OpenCode invocation
    const activityId = uuidv4();
    run(
      `INSERT INTO task_activities (id, task_id, activity_type, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [
        activityId,
        params.task_id,
        'updated',
        'Starting OpenCode coding session',
        JSON.stringify({ tool: 'opencode', prompt_preview: params.prompt.slice(0, 100) })
      ]
    );
    
    // Call the API endpoint
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/tools/opencode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: params.prompt,
        cwd,
        title,
        model: params.model,
        timeout: params.timeout || 120000,
      }),
    });
    
    if (!res.ok) {
      const error = await res.json();
      
      // Log failure
      run(
        `INSERT INTO task_activities (id, task_id, activity_type, message, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [
          uuidv4(),
          params.task_id,
          'updated',
          'OpenCode coding failed',
          JSON.stringify({ error: error.error, details: error.details })
        ]
      );
      
      return {
        success: false,
        output: '',
        files_modified: [],
        error: error.error || 'OpenCode execution failed',
        duration: Date.now() - startTime,
        activity_id: activityId,
      };
    }
    
    const result = await res.json();
    const duration = Date.now() - startTime;
    
    // Log success with file changes
    const filesModified = result.result?.files_modified || [];
    const hasChanges = filesModified.length > 0;
    
    run(
      `INSERT INTO task_activities (id, task_id, activity_type, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [
        uuidv4(),
        params.task_id,
        hasChanges ? 'completed' : 'updated',
        hasChanges 
          ? `OpenCode completed: ${filesModified.length} file(s) modified`
          : 'OpenCode completed (no file changes)',
        JSON.stringify({
          tool: 'opencode',
          duration: result.result?.duration || duration,
          files_modified: filesModified,
          exit_code: result.result?.exitCode,
          output_preview: result.result?.stdout?.slice(0, 500),
        })
      ]
    );
    
    // If files were modified, scan for deliverables
    if (hasChanges && cwd) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/tasks/${params.task_id}/deliverables/scan`, {
          method: 'POST',
        });
      } catch (scanError) {
        console.error('[OpenCode] Failed to scan deliverables:', scanError);
      }
    }
    
    return {
      success: result.success,
      output: result.result?.stdout || result.result?.parsed?.message || '',
      files_modified: filesModified,
      duration: result.result?.duration || duration,
      activity_id: activityId,
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.error('[OpenCode Tool] Error:', error);
    
    return {
      success: false,
      output: '',
      files_modified: [],
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
    };
  }
}

/**
 * Check if OpenCode is available on this system
 */
export async function isOpenCodeAvailable(): Promise<{ available: boolean; version?: string }> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/tools/opencode`, {
      method: 'GET',
    });
    
    const data = await res.json();
    return {
      available: data.installed,
      version: data.version,
    };
  } catch {
    return { available: false };
  }
}

/**
 * Tool definition for agent use
 */
export const opencodeToolDefinition = {
  name: 'opencode_coding',
  description: `Advanced coding tool powered by OpenCode CLI.
Uses LSP (Language Server Protocol) for intelligent code editing.
Best for: complex refactoring, multi-file changes, type checking, language-specific tooling.

When to use:
- Complex refactoring across multiple files
- Tasks requiring language server support (type checking, diagnostics)
- Multi-step coding with context preservation
- When standard agent tools aren't sufficient

Parameters:
- prompt: The coding task description (required)
- model: Optional model override (e.g., "claude-3.7-sonnet")
- timeout: Maximum execution time in ms (default: 120000)

Example: "Refactor the auth module to use JWT tokens instead of sessions"`,
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'The coding task to perform',
      },
      model: {
        type: 'string',
        description: 'Optional model to use',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds',
        default: 120000,
      },
    },
    required: ['prompt'],
  },
  invoke: invokeOpenCode,
};
