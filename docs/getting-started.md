# Getting Started

## Prerequisites

- **Node.js** 18+ (recommended: 20 LTS)
- **npm** 9+
- **OpenClaw Gateway** running at `ws://127.0.0.1:18789` (default)
- **SQLite3** (bundled via `better-sqlite3`, no separate install needed)

## Installation

```bash
# Clone the repository
git clone <repo-url> mission-control
cd mission-control

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at **http://localhost:3001**.

> **Note:** Port 3001 is the default. If port 3000 is available, you can override with `PORT=3000 npm run dev`.

## First Run

On first startup, Mission Control will:

1. **Create the SQLite database** (`mission-control.db` in the project root)
2. **Run all migrations** automatically (tables, indexes, FTS5)
3. **Seed default agents** if the agents table is empty:
   - Atlas (Master Agent)
   - Cai (Code & Architecture)
   - Dox (Documentation)
   - Luma (Design & Creative)
   - Vera (QA & Testing)

## Connecting to OpenClaw Gateway

Mission Control communicates with the OpenClaw Gateway via WebSocket. The gateway URL is auto-detected from:

1. `OPENCLAW_GATEWAY_URL` environment variable
2. `~/.openclaw/openclaw.json` configuration file
3. Default: `ws://127.0.0.1:18789`

Authentication is handled automatically using the device identity at `~/.openclaw/identity/device.json`.

You can also configure the gateway connection from **Settings > Gateway**.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Dev server port |
| `MISSION_CONTROL_URL` | `http://localhost:3001` | Self-referencing URL (auto-detected) |
| `OPENCLAW_GATEWAY_URL` | `ws://127.0.0.1:18789` | Gateway WebSocket URL |
| `OPENCLAW_GATEWAY_TOKEN` | *(from device identity)* | Gateway auth token |
| `WORKSPACE_BASE_PATH` | `~/Documents/Shared` | Base workspace directory |
| `PROJECTS_PATH` | `~/Documents/Shared/projects` | Projects directory |
| `DATABASE_PATH` | `mission-control.db` | SQLite database file |
| `NGROK_AUTOSTART` | `true` | Auto-start ngrok on launch |
| `VOICE_WEBHOOK_PORT` | `3334` | Port for voice call webhooks |
| `SMTP_HOST` | — | SMTP server for email notifications |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | — | From address for emails |

## Database Commands

```bash
# Run migrations manually
npm run db:migrate

# Seed default data
npm run db:seed

# Backup database
npm run db:backup

# Restore from backup
npm run db:restore

# Reset to fresh state (deletes all data)
npm run db:reset
```

## Disabling Turbopack

Mission Control uses `better-sqlite3`, a native Node.js module. Turbopack (Next.js 16 default) has issues bundling native modules, so it is disabled:

```bash
NEXT_DISABLE_TURBOPACK=1 next dev --port 3001
```

This is already configured in the `npm run dev` script.

## Next Steps

- Read the [Features Guide](./features.md) to learn how to use the dashboard
- Set up [Voice Calls](./voice-calls.md) for phone notifications
- Review the [Settings](./settings.md) page for customization options
