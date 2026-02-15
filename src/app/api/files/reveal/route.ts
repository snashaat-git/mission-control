import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getProjectsPath } from '@/lib/config';

const execAsync = promisify(exec);

const HOME = os.homedir();

// Allowed base directories for security
function getAllowedDirs(): string[] {
  const projectsPath = getProjectsPath();
  return [
    projectsPath,
    path.join(HOME, '.openclaw/workspace'),
    path.join(HOME, 'openclaw/workspace'),
    path.join(HOME, 'Projects'),
    path.join(HOME, 'Documents'),
  ].map(p => p.replace(/^~/, HOME));
}

function isPathAllowed(filePath: string): boolean {
  const allowedDirs = getAllowedDirs();
  const resolvedPath = path.resolve(filePath);
  return allowedDirs.some(dir => resolvedPath.startsWith(path.resolve(dir)));
}

// Detect platform and return the right "open/reveal" command
function getRevealCommand(filePath: string): string {
  const platform = os.platform();
  // Shell-escape the path
  const escaped = filePath.replace(/'/g, "'\\''");
  if (platform === 'darwin') {
    return `open -R '${escaped}'`;
  }
  // Linux: open the containing directory in the default file manager
  const dir = fs.statSync(filePath).isDirectory() ? filePath : path.dirname(filePath);
  const escapedDir = dir.replace(/'/g, "'\\''");
  return `xdg-open '${escapedDir}'`;
}

// POST /api/files/reveal
// Opens a file or directory in the system file manager
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filePath } = body;

    if (!filePath) {
      return NextResponse.json(
        { error: 'filePath is required' },
        { status: 400 }
      );
    }

    // Normalize path and expand tilde
    const normalizedPath = filePath.replace(/^~/, HOME);
    const resolvedPath = path.resolve(normalizedPath);

    // Security check
    if (!isPathAllowed(resolvedPath)) {
      return NextResponse.json(
        { error: 'Path is outside allowed directories', path: resolvedPath },
        { status: 403 }
      );
    }

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json(
        { error: 'File or directory not found', path: resolvedPath },
        { status: 404 }
      );
    }

    // Open in file manager
    const cmd = getRevealCommand(resolvedPath);
    await execAsync(cmd);

    return NextResponse.json({
      success: true,
      message: 'Opened in file manager',
      path: resolvedPath,
    });
  } catch (error) {
    console.error('[Files/Reveal] Error:', error);
    return NextResponse.json(
      { error: 'Failed to reveal file', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
