import { NextRequest, NextResponse } from 'next/server';
import { strictLimiter, standardLimiter, relaxedLimiter } from '@/lib/rate-limit';
import type { RateLimiter } from '@/lib/rate-limit';

// Exempt routes (no rate limiting)
const EXEMPT_PATHS = [
  '/api/events/stream', // SSE persistent connection
];

// Strict tier: expensive operations
const STRICT_PREFIXES = [
  '/api/search',
  '/api/prompts/enhance',
  '/api/workflows',
  '/api/files/upload',
];

// Relaxed tier: high-frequency polling endpoints
const RELAXED_PREFIXES = [
  '/api/events',
  '/api/openclaw/status',
  '/api/openclaw/sessions',
];

function getLimiter(pathname: string): RateLimiter | null {
  // Check exempt first
  for (const path of EXEMPT_PATHS) {
    if (pathname === path) return null;
  }

  // Strict tier
  for (const prefix of STRICT_PREFIXES) {
    if (pathname.startsWith(prefix)) return strictLimiter;
  }

  // Relaxed tier
  for (const prefix of RELAXED_PREFIXES) {
    if (pathname.startsWith(prefix)) return relaxedLimiter;
  }

  // Everything else under /api/ gets standard limits
  return standardLimiter;
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only rate-limit API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const limiter = getLimiter(pathname);
  if (!limiter) {
    return NextResponse.next();
  }

  const ip = getClientIp(request);
  const result = limiter.check(ip);

  if (!result.success) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);

    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
          'Retry-After': String(retryAfter),
        },
      }
    );
  }

  // Attach rate limit headers to successful responses
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', String(result.limit));
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
