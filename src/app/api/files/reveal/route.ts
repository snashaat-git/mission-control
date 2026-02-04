import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { getProjectsPath } from '@/lib/config';

const execAsync = promisify(exec);

// Allowed base directories for security
function getAllowedDirs(): string[] {
  const projectsPath = getProjectsPath();
  return [
    projectsPath,
    '/Users/snashaat/.openclaw/workspace/projects',
    '/Users/snashaat/Projects',
    '/Users/snashaat/Documents',
  ].map(p => p.replace(/^~/, process.env.HOME || ''));
}

function isPathAllowed(filePath: string): boolean {
  const allowedDirs = getAllowedDirs();
  const resolvedPath = path.resolve(filePath);
  return allowedDirs.some(dir => resolvedPath.startsWith(path.resolve(dir)));
}

// POST /api/files/reveal
// Opens a file or directory in macOS Finder
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
    const normalizedPath = filePath.replace(/^~/, process.env.HOME || '');
    const resolvedPath = path.resolve(normalizedPath);

    // Security check
    if (!isPathAllowed(resolvedPath)) {
      return NextResponse.json(
        { error: 'Path is outside allowed directories', path: resolvedPath },
        { status: 403 }
      );
    }

    // Check if file exists
    try {
      await execAsync(`test -e "${resolvedPath}"`);
    } catch {
      return NextResponse.json(
        { error: 'File or directory not found', path: resolvedPath },
        { status: 404 }
      );
    }

    // Open in Finder
    await execAsync(`open -R "${resolvedPath}"`);

    return NextResponse.json({
      success: true,
      message: 'Opened in Finder',
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
