# Architecture

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS 3 + CSS custom properties |
| State Management | Zustand 5 |
| Database | SQLite via better-sqlite3 |
| Drag & Drop | @hello-pangea/dnd |
| Icons | lucide-react |
| Date Formatting | date-fns |
| Email | nodemailer |
| Real-time | Server-Sent Events (SSE) |

## Project Structure

```
mission-control/
├── docs/                          # Documentation (you are here)
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── api/                   # API routes (REST)
│   │   │   ├── agents/            # Agent CRUD
│   │   │   ├── tasks/             # Task CRUD + dispatch + activities + deliverables
│   │   │   ├── openclaw/          # Gateway proxy (sessions, history, models)
│   │   │   ├── voicecall/         # Voice call initiation + management
│   │   │   ├── contacts/          # Phonebook CRUD
│   │   │   ├── events/            # Event feed + SSE stream
│   │   │   ├── search/            # FTS5 search
│   │   │   ├── settings/          # Gateway, rate-limit, voice-call settings
│   │   │   ├── prompts/           # Prompt library CRUD
│   │   │   ├── workflows/         # Workflow templates
│   │   │   ├── conversations/     # Agent conversations
│   │   │   ├── files/             # Upload, download, preview, reveal
│   │   │   └── webhooks/          # Agent completion webhook
│   │   ├── settings/              # Settings page
│   │   ├── page.tsx               # Main dashboard
│   │   ├── layout.tsx             # Root layout
│   │   └── globals.css            # Theme variables + Tailwind
│   ├── components/                # React components
│   │   ├── Header.tsx
│   │   ├── AgentsSidebar.tsx
│   │   ├── MissionQueue.tsx       # Kanban board
│   │   ├── TaskModal.tsx
│   │   ├── AgentModal.tsx
│   │   ├── VoiceCallModal.tsx
│   │   ├── CallHistory.tsx
│   │   ├── SearchBar.tsx
│   │   ├── SessionsList.tsx
│   │   ├── SessionView.tsx
│   │   ├── PromptsLibrary.tsx
│   │   ├── PromptEditor.tsx
│   │   ├── TemplatePicker.tsx
│   │   ├── DeliverablesList.tsx
│   │   ├── DependenciesList.tsx
│   │   ├── ChatModal.tsx
│   │   ├── VoiceInterface.tsx
│   │   └── Providers.tsx
│   ├── hooks/                     # Custom React hooks
│   │   ├── useSSE.ts              # SSE event stream
│   │   ├── useSessionHistory.ts   # OpenClaw session polling
│   │   ├── useNotifications.ts    # Browser notifications
│   │   ├── useTheme.ts            # Dark/light theme
│   │   └── useToast.tsx           # Toast notifications
│   ├── lib/                       # Shared utilities
│   │   ├── db/
│   │   │   ├── index.ts           # Database connection + helpers
│   │   │   └── schema.ts          # SQL schema definitions
│   │   ├── openclaw/
│   │   │   └── client.ts          # Gateway WebSocket client
│   │   ├── config.ts              # Configuration management
│   │   ├── types.ts               # TypeScript interfaces
│   │   ├── templates.ts           # Task + workflow templates
│   │   ├── task-completion-watcher.ts  # Monitors agent progress
│   │   ├── task-notifier.ts       # Phone/email notifications
│   │   ├── events.ts              # SSE broadcast utility
│   │   └── rate-limit.ts          # Rate limiting middleware
│   ├── instrumentation.ts         # ngrok auto-start on server boot
│   └── middleware.ts              # Rate limiting middleware
├── mission-control.db             # SQLite database (auto-created)
├── next.config.mjs                # Next.js configuration
├── tailwind.config.ts             # Tailwind configuration
├── package.json
└── tsconfig.json
```

## Data Flow

### Task Lifecycle

```
User creates task → POST /api/tasks → SQLite INSERT
                  → SSE broadcast "task_created"

User assigns agent → PATCH /api/tasks/[id] (status: assigned)
                   → POST /api/tasks/[id]/dispatch
                   → WebSocket → OpenClaw Gateway → Agent session
                   → SSE broadcast "task_updated"

Agent works        → Logs activities via POST /api/tasks/[id]/activities
                   → Adds deliverables via POST /api/tasks/[id]/deliverables
                   → SSE broadcasts in real-time

Agent completes    → Webhook POST /api/webhooks/agent-completion
                   → task-completion-watcher detects completion
                   → PATCH status → "done"
                   → task-notifier sends phone/email if configured
                   → SSE broadcast "task_updated"
```

### Real-time Updates (SSE)

```
Browser ← SSE ← GET /api/events/stream ← broadcast()
                                         ↑
                         All API routes call broadcast()
                         on state changes
```

The SSE connection:
- Sends a keepalive ping every 30 seconds
- Auto-reconnects on disconnect (5-second delay)
- Triggers browser notifications for key events

### OpenClaw Gateway Communication

```
Mission Control → WebSocket → OpenClaw Gateway
                              ├── sessions.list
                              ├── sessions.patch (model override)
                              ├── chat.send (dispatch task)
                              ├── chat.history (session messages)
                              ├── voicecall.initiate
                              ├── voicecall.continue
                              ├── voicecall.speak
                              ├── voicecall.end
                              └── voicecall.status
```

The gateway client is a singleton at `src/lib/openclaw/client.ts`. The default session key for the main agent is `agent:main:main`.

## State Management

The Zustand store (`useMissionControl`) holds all client-side state:

```typescript
{
  agents: Agent[]              // All agents
  tasks: Task[]                // All tasks
  events: Event[]              // Live feed events
  conversations: Conversation[]
  messages: Message[]
  voiceCalls: VoiceCall[]      // Call history
  activeCall: VoiceCall | null // Currently active call
  selectedAgent: Agent | null
  selectedTask: Task | null
  isOnline: boolean            // Gateway connection status
  isLoading: boolean
  selectedBusiness: string     // Active workspace filter
}
```

The main page polls APIs at different intervals:
- Events: every 5 seconds
- Tasks: every 10 seconds
- OpenClaw status: every 30 seconds

SSE updates are applied immediately to the store for real-time responsiveness.

## Theming

CSS custom properties define the color palette:

```css
:root {
  --mc-bg: ...;
  --mc-bg-secondary: ...;
  --mc-text: ...;
  --mc-accent: ...;
  /* ... */
}

[data-theme="dark"] {
  --mc-bg: ...;
  /* ... */
}
```

Theme is toggled by setting `data-theme` on the `<html>` element. Saved to `localStorage` under `mc-theme`.
