/**
 * Next.js Instrumentation Hook
 * Runs once when the server starts.
 * Auto-starts ngrok tunnel for voice call webhooks.
 */

export async function register() {
  // Only run on the server (not edge runtime)
  if (process.env.NEXT_RUNTIME === 'edge') return;

  // Only auto-start ngrok if enabled
  const ngrokEnabled = process.env.NGROK_AUTOSTART !== 'false';
  if (!ngrokEnabled) return;

  // Dynamic imports to avoid bundling issues
  const { spawn } = await import('child_process');
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');

  const HOME = os.homedir();
  const NGROK_BIN = path.join(HOME, 'bin', 'ngrok');
  const OPENCLAW_CONFIG = path.join(HOME, '.openclaw', 'openclaw.json');
  const WEBHOOK_PORT = process.env.VOICE_WEBHOOK_PORT || '3334';

  // Check if ngrok binary exists
  if (!fs.existsSync(NGROK_BIN)) {
    console.log('[ngrok] Binary not found at ~/bin/ngrok — skipping auto-start');
    return;
  }

  // Check if ngrok is already running
  try {
    const res = await fetch('http://127.0.0.1:4040/api/tunnels', {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.tunnels?.length > 0) {
        const url = data.tunnels.find((t: any) => t.proto === 'https')?.public_url || data.tunnels[0].public_url;
        console.log(`[ngrok] Already running at ${url}`);
        updateOpenClawConfig(fs, OPENCLAW_CONFIG, url + '/voice/webhook');
        return;
      }
    }
  } catch {
    // Not running, proceed to start
  }

  console.log(`[ngrok] Starting tunnel on port ${WEBHOOK_PORT}...`);

  const ngrokProcess = spawn(NGROK_BIN, ['http', WEBHOOK_PORT], {
    detached: true,
    stdio: 'ignore',
  });

  // Don't let ngrok prevent Node from exiting
  ngrokProcess.unref();

  // Store PID for cleanup
  const pidFile = path.join(HOME, '.openclaw', '.ngrok.pid');
  fs.writeFileSync(pidFile, String(ngrokProcess.pid));

  // Wait for ngrok to be ready and get the URL
  let attempts = 0;
  const maxAttempts = 15;

  const detectUrl = async (): Promise<string | null> => {
    while (attempts < maxAttempts) {
      attempts++;
      await new Promise(r => setTimeout(r, 1000));

      try {
        const res = await fetch('http://127.0.0.1:4040/api/tunnels', {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          const data = await res.json();
          const tunnel = data.tunnels?.find((t: any) => t.proto === 'https') || data.tunnels?.[0];
          if (tunnel?.public_url) {
            return tunnel.public_url;
          }
        }
      } catch {
        // Not ready yet
      }
    }
    return null;
  };

  const url = await detectUrl();

  if (url) {
    const webhookUrl = url + '/voice/webhook';
    console.log(`[ngrok] Tunnel ready: ${webhookUrl}`);
    updateOpenClawConfig(fs, OPENCLAW_CONFIG, webhookUrl);
  } else {
    console.warn('[ngrok] Failed to detect tunnel URL after 15 attempts');
  }
}

function updateOpenClawConfig(fs: typeof import('fs'), configPath: string, publicUrl: string): void {
  try {
    if (!fs.existsSync(configPath)) return;

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const vc = config?.plugins?.entries?.['voice-call']?.config;
    if (!vc) return;

    // Only update if the URL actually changed
    if (vc.publicUrl === publicUrl) return;

    vc.publicUrl = publicUrl;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    console.log(`[ngrok] Updated openclaw.json publicUrl → ${publicUrl}`);
  } catch (err) {
    console.warn('[ngrok] Failed to update openclaw.json:', err);
  }
}
