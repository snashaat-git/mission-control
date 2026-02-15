# Settings

Access settings at `/settings` or via the gear icon in the header.

## Gateway

Configure the connection to the OpenClaw Gateway.

| Setting | Description |
|---|---|
| **Gateway URL** | WebSocket URL (default: `ws://127.0.0.1:18789`) |
| **Auth Token** | Authentication token (auto-detected from device identity) |

Click **Test Connection** to verify the gateway is reachable.

## Voice Calls

Configure the voice call plugin (requires OpenClaw voice-call plugin).

| Setting | Description |
|---|---|
| **Webhook URL** | Public URL for voice webhooks (ngrok or custom) |
| **From Number** | Default outgoing phone number |
| **Inbound Policy** | `allowlist`, `blocklist`, or `disabled` |
| **Inbound Greeting** | Message played to incoming callers |

Click **Detect ngrok** to automatically find the ngrok tunnel URL.

## Rate Limiting

Configure API rate limiting to protect against abuse.

| Setting | Description |
|---|---|
| **Max Requests** | Maximum requests per time window |
| **Window (seconds)** | Time window for rate counting |
| **Per-route overrides** | Custom limits for specific API routes |

## Notifications

| Setting | Description |
|---|---|
| **Browser Notifications** | Enable/disable desktop notifications |
| **Permission** | Request browser notification permission |

## Theme

| Setting | Description |
|---|---|
| **Dark / Light** | Toggle between dark and light mode |

The theme preference is saved to `localStorage` under the key `mc-theme`.

## Email Notifications (SMTP)

Email notifications for task completion/failure require SMTP configuration via environment variables:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Mission Control <noreply@yourdomain.com>
```

Add these to your `.env.local` file or set them in your environment before starting the server.
