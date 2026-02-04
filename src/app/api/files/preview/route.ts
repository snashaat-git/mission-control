import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getProjectsPath } from '@/lib/config';

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

// GET /api/files/preview?path=/full/path/to/file
// Returns file content for preview (HTML, text, markdown, etc.)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json(
        { error: 'path query parameter is required' },
        { status: 400 }
      );
    }

    // Normalize path and expand tilde
    const normalizedPath = filePath.replace(/^~/, process.env.HOME || '');
    const resolvedPath = path.resolve(normalizedPath);

    // Security check
    if (!isPathAllowed(resolvedPath)) {
      return NextResponse.json(
        { error: 'Path is outside allowed directories' },
        { status: 403 }
      );
    }

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json(
        { error: 'File not found', path: resolvedPath },
        { status: 404 }
      );
    }

    // Check if it's a file (not directory)
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) {
      return NextResponse.json(
        { error: 'Path is not a file', path: resolvedPath },
        { status: 400 }
      );
    }

    // Get file extension and content type
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      '.html': 'text/html',
      '.htm': 'text/html',
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
    };

    const contentType = contentTypeMap[ext] || 'text/plain';

    // Read file content
    const content = fs.readFileSync(resolvedPath, 'utf-8');

    // Return with appropriate content type
    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[Files/Preview] Error:', error);
    return NextResponse.json(
      { error: 'Failed to preview file', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
