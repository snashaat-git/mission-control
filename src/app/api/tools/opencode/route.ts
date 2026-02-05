// API endpoint to invoke OpenCode CLI for coding tasks
// POST /api/tools/opencode - Run opencode non-interactively

import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

interface OpenCodeRequest {
  prompt: string;
  cwd?: string;
  title?: string;
  model?: string;
  timeout?: number; // milliseconds
  context_files?: string[]; // Files to include as context
}

interface OpenCodeResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  files_modified?: string[];
  duration: number;
}

// POST /api/tools/opencode
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body: OpenCodeRequest = await request.json();
    const { 
      prompt, 
      cwd = process.cwd(),
      title,
      model,
      timeout = 120000, // 2 minutes default
      context_files = []
    } = body;

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Sanitize prompt for shell safety
    const sanitizedPrompt = prompt.replace(/"/g, '\\"');
    
    // Build command
    const args: string[] = ['run', `"${sanitizedPrompt}"`, '-f', 'json'];
    
    if (title) {
      args.push('--title', `"${title.replace(/"/g, '\\"')}"`);
    }
    
    if (model) {
      args.push('--model', model);
    }
    
    args.push('--cwd', cwd);
    
    // Check if opencode is installed
    try {
      await execAsync('which opencode', { timeout: 5000 });
    } catch {
      return NextResponse.json(
        { 
          error: 'OpenCode CLI not found',
          message: 'Please install OpenCode: https://opencode.ai/',
          install_commands: [
            'brew install opencode-ai/tap/opencode',
            'or',
            'curl -fsSL https://opencode.ai/install | bash'
          ]
        },
        { status: 500 }
      );
    }

    const command = `opencode ${args.join(' ')}`;
    
    console.log(`[OpenCode] Executing: ${command}`);
    console.log(`[OpenCode] Working directory: ${cwd}`);
    
    // Execute opencode
    let result: OpenCodeResult;
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        cwd,
        env: {
          ...process.env,
          // Ensure opencode can find its config
          OPENCODE_CONFIG_DIR: process.env.OPENCODE_CONFIG_DIR || `${process.env.HOME}/.config/opencode`,
        }
      });
      
      result = {
        stdout,
        stderr,
        exitCode: 0,
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      // opencode may exit non-zero but still produce useful output
      result = {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1,
        duration: Date.now() - startTime
      };
    }

    // Parse JSON output if present
    let parsedOutput: any = null;
    let filesModified: string[] = [];
    
    try {
      // Try to find JSON in the output
      const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedOutput = JSON.parse(jsonMatch[0]);
        
        // Extract file modifications if available
        if (parsedOutput.files_modified) {
          filesModified = parsedOutput.files_modified;
        } else if (parsedOutput.changes) {
          filesModified = parsedOutput.changes.map((c: any) => c.file);
        }
      }
    } catch (parseError) {
      console.log('[OpenCode] Could not parse JSON output, using raw text');
    }

    // Log to OpenCode history file for reference
    const logEntry = {
      timestamp: new Date().toISOString(),
      prompt: body.prompt,
      cwd: body.cwd,
      duration: result.duration,
      exitCode: result.exitCode,
      model: body.model,
    };
    
    // Ensure log directory exists
    const logDir = path.join(process.cwd(), 'logs', 'opencode');
    await mkdir(logDir, { recursive: true }).catch(() => {});
    
    const logFile = path.join(logDir, `opencode-${Date.now()}.json`);
    await writeFile(logFile, JSON.stringify(logEntry, null, 2)).catch(() => {});

    return NextResponse.json({
      success: result.exitCode === 0,
      result: {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        duration: result.duration,
        parsed: parsedOutput,
        files_modified: filesModified,
      },
      command,
      workspace: cwd,
      log_file: logFile,
    });

  } catch (error) {
    console.error('[OpenCode] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to execute OpenCode',
        details: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      },
      { status: 500 }
    );
  }
}

// GET /api/tools/opencode/status - Check if opencode is installed
export async function GET() {
  try {
    const { stdout } = await execAsync('opencode --version', { timeout: 5000 });
    return NextResponse.json({
      installed: true,
      version: stdout.trim(),
    });
  } catch {
    return NextResponse.json({
      installed: false,
      version: null,
      install_url: 'https://opencode.ai/',
    });
  }
}
