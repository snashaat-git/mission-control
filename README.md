# Mission Control 🦞

AI Agent Orchestration Dashboard for OpenClaw.

![Mission Control](docs/images/mission_control.png)

## Features

### Core
- **Agent Management**: Create, configure, and monitor AI agents with custom personalities (SOUL.md, USER.md, AGENTS.md)
- **Mission Queue**: Kanban-style task board with drag-and-drop (INBOX → ASSIGNED → IN PROGRESS → TESTING → REVIEW → DONE)
- **Automated Task Dispatch**: Tasks automatically route to agents' OpenClaw sessions when assigned
- **Completion Detection**: Agents report completion via TASK_COMPLETE message, auto-moves to review
- **Quality Control**: Only master agent (Atlas) can approve tasks from review to done
- **Agent Chat**: Real-time agent-to-agent conversations
- **Live Feed**: Real-time SSE event stream showing all activity
- **OpenClaw Integration**: Connects to your local OpenClaw Gateway

### Phase 1 — Core Workflow & Reliability
- **Task Dependencies**: Add/remove dependencies between tasks with cycle detection. Lock badges on Kanban prevent starting blocked tasks.
- **Live Session View**: Real-time chat history with 3s polling, message sending, and auto-scroll. Accessible from Sessions list and Agent sidebar.
- **Failure Detection + Auto-Retry**: Detects agent offline, session failures, task timeouts (configurable via `MC_TASK_TIMEOUT_MINUTES`), and `TASK_FAILED:` chat patterns. Auto-retries up to `max_retries` (default 2), then marks as failed. Retry button in Kanban and TaskModal.
- **Browser Notifications**: Fires on task completed, ready for review, task failed, or agent finished. Only when tab is backgrounded. Toggle in Settings.
- **Workflow Templates**: 3 built-in workflows (Research→Write→Review, Design→Develop→Test, Full Project Pipeline) that create multiple tasks with auto-linked dependencies.

### Phase 2 — Quality of Life & Performance
- **Full-Text Search (FTS5)**: SQLite FTS5 virtual table on tasks with auto-sync triggers. Search bar with debounced input, dropdown results with status badges, and keyboard navigation.
- **Kanban Performance**: `React.memo` on TaskCard, `useMemo` for task grouping, `useCallback` for drag handlers, module-level constants.

### Phase 3 — Advanced Features
- **API Rate Limiting**: Next.js middleware with sliding window rate limiter. Three tiers: Strict (20 req/min), Standard (60 req/min), Relaxed (120 req/min). SSE exempt. Returns 429 with `X-RateLimit-*` headers.

### Phase 4 — UI Polish & Accessibility
- **Empty States**: Kanban columns show contextual messages. During drag, targets highlight with dashed borders and "Drop here" text.
- **Global Toast System**: Replaced all `alert()` calls with toast notifications. Four types (success, error, warning, info) with auto-dismiss and stacking.
- **Drag-and-Drop Visual Feedback**: Accent border glow, box-shadow, and header color changes on target columns during drag.
- **Skeleton Loaders**: Full structural skeleton with pulsing placeholders for header, sidebar agents, and kanban cards.
- **Accessibility (ARIA & Focus)**: `aria-label` on all icon buttons, `role="dialog"` on all modals, `focus-visible` ring, `prefers-reduced-motion` support, skip-to-content link.
- **Mobile Responsiveness**: Collapsible sidebar with slide-over drawer, responsive modals, 44px touch targets, mobile-optimized kanban.
- **Dark/Light Mode**: Full theme toggle with CSS variables, localStorage persistence, and flash-prevention script.

## How It Works

### The Automated Workflow

1. **You assign a task** → Drag task to agent in ASSIGNED column
2. **System auto-dispatches** → Task details sent to agent's OpenClaw session
3. **Agent works** → Task moves to IN PROGRESS, agent status becomes "working"
4. **Agent completes** → Agent replies `TASK_COMPLETE: [summary]`
5. **Auto-review** → Task moves to REVIEW, agent returns to "standby"
6. **Atlas approves** → Master agent reviews work, moves to DONE

### Agent Protocol

Agents receive tasks like this:
```
🔵 **NEW TASK ASSIGNED**

**Title:** Build authentication system
**Priority:** HIGH
**Task ID:** abc-123

Please work on this task. When complete, reply with:
`TASK_COMPLETE: [brief summary of what you did]`
```

See [Agent Protocol Documentation](docs/AGENT_PROTOCOL.md) for full details.

## Quick Start

### Prerequisites

- Node.js 20+
- OpenClaw running locally (`openclaw gateway start`)
- npm or pnpm

### 5-Minute Setup

```bash
# Clone the repository
git clone https://github.com/snashaat-git/mission-control.git
cd mission-control

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your paths and settings

# Initialize database
npm run db:seed

# Start development server
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) to see Mission Control.

### Configuration

Mission Control supports **two configuration methods**:

1. **Environment Variables** (`.env.local`) - Server-side config, best for deployments
2. **Settings UI** - User preferences via web interface (Settings gear icon)

### Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKSPACE_BASE_PATH` | `~/Documents/Shared` | Base directory for workspace |
| `PROJECTS_PATH` | `~/Documents/Shared/projects` | Project folders location |
| `MISSION_CONTROL_URL` | Auto-detected | API URL for orchestration |
| `OPENCLAW_GATEWAY_URL` | `ws://127.0.0.1:18789` | Gateway WebSocket URL |
| `OPENCLAW_GATEWAY_TOKEN` | (empty) | Auth token (required for remote) |
| `DATABASE_PATH` | `./mission-control.db` | SQLite database path |
| `MC_TASK_TIMEOUT_MINUTES` | `30` | Task timeout before failure detection |

**Security:** Never commit `.env.local`! It's gitignored by default.

## Architecture

```
mission-control/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes
│   │   │   ├── agents/        # Agent CRUD
│   │   │   ├── tasks/         # Task CRUD + dispatch + dependencies + retry
│   │   │   ├── conversations/ # Chat/conversations
│   │   │   ├── events/        # Live feed events (SSE)
│   │   │   ├── openclaw/      # OpenClaw integration + models
│   │   │   ├── search/        # FTS5 search
│   │   │   ├── settings/      # Gateway + rate limit settings
│   │   │   └── workflows/     # Workflow template execution
│   │   ├── settings/          # Settings page
│   │   ├── layout.tsx
│   │   └── page.tsx           # Main dashboard
│   ├── components/            # React components
│   │   ├── Header.tsx
│   │   ├── AgentsSidebar.tsx
│   │   ├── AgentModal.tsx
│   │   ├── MissionQueue.tsx   # Kanban board
│   │   ├── TaskModal.tsx
│   │   ├── ChatModal.tsx
│   │   ├── SearchBar.tsx      # FTS5 search UI
│   │   ├── SessionView.tsx    # Live session viewer
│   │   ├── DependenciesList.tsx
│   │   ├── TemplatePicker.tsx # Templates + workflows
│   │   └── Providers.tsx      # Theme + toast providers
│   ├── hooks/
│   │   ├── useSSE.ts          # Server-sent events
│   │   ├── useSessionHistory.ts
│   │   ├── useNotifications.ts
│   │   ├── useTheme.ts
│   │   └── useToast.tsx
│   ├── lib/
│   │   ├── db/                # SQLite database + FTS5
│   │   ├── openclaw/          # OpenClaw client
│   │   ├── rate-limit.ts      # Sliding window rate limiter
│   │   ├── task-completion-watcher.ts
│   │   ├── store.ts           # Zustand state
│   │   ├── templates.ts       # Task + workflow templates
│   │   └── types.ts           # TypeScript types
│   └── middleware.ts          # Rate limiting middleware
├── mission-control.db         # SQLite database (created on seed)
└── package.json
```

## Agents

Five built-in agents:

| Agent | Role | Description |
|-------|------|-------------|
| **Atlas** | Master Orchestrator | Coordinates all agents, triages tasks, approves reviews |
| **Cai** | Developer | Handles coding and technical implementation |
| **Dox** | Writer | Documentation, content, and research |
| **Luma** | Designer | UI/UX design and visual assets |
| **Vera** | QA | Testing, quality assurance, and verification |

Each agent can have custom personality files: `SOUL.md`, `USER.md`, `AGENTS.md`.

## API Endpoints

### Agents
- `GET /api/agents` - List all agents
- `POST /api/agents` - Create agent
- `GET /api/agents/[id]` - Get agent
- `PATCH /api/agents/[id]` - Update agent
- `DELETE /api/agents/[id]` - Delete agent

### Tasks
- `GET /api/tasks` - List tasks (with filters)
- `POST /api/tasks` - Create task
- `GET /api/tasks/[id]` - Get task
- `PATCH /api/tasks/[id]` - Update task
- `DELETE /api/tasks/[id]` - Delete task
- `POST /api/tasks/[id]/dispatch` - Dispatch task to agent
- `POST /api/tasks/[id]/retry` - Retry a failed task

### Task Dependencies
- `GET /api/tasks/[id]/dependencies` - List dependencies
- `POST /api/tasks/[id]/dependencies` - Add dependency (with cycle detection)
- `DELETE /api/tasks/[id]/dependencies/[depId]` - Remove dependency

### Search
- `GET /api/search?q=` - Full-text search across tasks and agents

### Workflows
- `POST /api/workflows` - Execute workflow template (creates tasks with dependencies)

### Settings
- `GET /api/settings/gateway` - Get gateway configuration
- `POST /api/settings/gateway` - Update gateway configuration
- `GET /api/settings/rate-limit` - Get rate limit settings
- `POST /api/settings/rate-limit` - Update rate limit settings

### Conversations
- `GET /api/conversations` - List conversations
- `POST /api/conversations` - Create conversation
- `GET /api/conversations/[id]/messages` - Get messages
- `POST /api/conversations/[id]/messages` - Send message

### Events
- `GET /api/events` - SSE event stream (live feed)
- `POST /api/events` - Create event

### OpenClaw
- `GET /api/openclaw/status` - Check Gateway connection status
- `GET /api/openclaw/sessions` - List OpenClaw sessions
- `POST /api/openclaw/sessions` - Create session
- `GET /api/openclaw/sessions/[id]` - Get session details
- `POST /api/openclaw/sessions/[id]` - Send message to session
- `GET /api/openclaw/sessions/[id]/history` - Get session history
- `PATCH /api/openclaw/sessions/[id]` - Update session
- `DELETE /api/openclaw/sessions/[id]` - Delete a session
- `GET /api/openclaw/models` - List available models

### Agent ↔ OpenClaw Linking
- `GET /api/agents/[id]/openclaw` - Get agent's OpenClaw session
- `POST /api/agents/[id]/openclaw` - Link agent to OpenClaw
- `DELETE /api/agents/[id]/openclaw` - Unlink agent from OpenClaw

### Task Activities & Deliverables
- `GET /api/tasks/[id]/activities` - List task activities
- `POST /api/tasks/[id]/activities` - Log activity
- `GET /api/tasks/[id]/deliverables` - List deliverables
- `POST /api/tasks/[id]/deliverables` - Add deliverable

### Files (for remote agents)
- `POST /api/files/upload` - Upload file from remote agent
- `POST /api/files/reveal` - Open file in Finder
- `GET /api/files/preview` - Preview HTML file

### Webhooks
- `POST /api/webhooks/agent-completion` - Agent completion notification

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite (better-sqlite3) with FTS5
- **State**: Zustand
- **Icons**: Lucide React
- **Real-time**: Server-Sent Events (SSE)

## Development

```bash
# Run development server (port 3001)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run database migrations
npm run db:migrate

# Seed database with sample data
npm run db:seed

# Backup current database state
npm run db:backup

# Restore database from backup
npm run db:restore

# Full reset (delete + reseed)
npm run db:reset

# Lint code
npm run lint
```

## License

MIT
