import { NextResponse } from 'next/server';

// GET /api/settings/voice-call/detect-ngrok
// Auto-detect running ngrok tunnel URL
export async function GET() {
  try {
    const res = await fetch('http://127.0.0.1:4040/api/tunnels', {
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'ngrok API returned an error' },
        { status: 502 }
      );
    }

    const data = await res.json();
    const tunnels = data.tunnels || [];

    // Find HTTPS tunnel
    const httpsTunnel = tunnels.find((t: any) => t.proto === 'https');
    const tunnel = httpsTunnel || tunnels[0];

    if (!tunnel) {
      return NextResponse.json(
        { error: 'No active ngrok tunnels found. Start ngrok with: ngrok http 3334' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      url: tunnel.public_url,
      proto: tunnel.proto,
      addr: tunnel.config?.addr,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Cannot reach ngrok. Is it running? Start with: ngrok http 3334' },
      { status: 503 }
    );
  }
}
