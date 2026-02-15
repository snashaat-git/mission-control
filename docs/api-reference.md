# API Reference

All endpoints are under `/api/`. Responses are JSON. Errors return `{ error: string }` with an appropriate HTTP status code.

---

## Tasks

### `GET /api/tasks`

List all tasks with optional filters.

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `status` | string | Filter by status (comma-separated, e.g. `inbox,assigned,in_progress`) |
| `business_id` | string | Filter by workspace |
| `assigned_agent_id` | string | Filter by assigned agent |

**Response:** `Task[]` — Each task includes `dependency_count`, `blocking_count`, and `is_blocked` metadata.

### `POST /api/tasks`

Create a new task.

**Body:**
```json
{
  "title": "Research: AI trends",
  "description": "Research and compile findings...",
  "priority": "normal",
  "assigned_agent_id": "uuid",
  "created_by_agent_id": "uuid",
  "business_id": "default",
  "due_date": "2026-03-01T12:00:00.000Z",
  "notify_settings": {
    "phone": "+1234567890",
    "email": "user@example.com",
    "on_complete": true,
    "on_failure": true
  }
}
```

**Response:** `201` — Created task.

### `GET /api/tasks/:id`

Get a single task by ID.

### `PATCH /api/tasks/:id`

Update a task. Supports partial updates.

**Body (all fields optional):**
```json
{
  "title": "Updated title",
  "description": "Updated description",
  "status": "assigned",
  "priority": "high",
  "assigned_agent_id": "uuid",
  "due_date": "2026-03-01T12:00:00.000Z",
  "notify_settings": { ... }
}
```

**Status Transitions:** The API enforces valid workflow transitions:
`inbox → assigned → in_progress → testing → review → done`

Moving to `assigned` auto-dispatches the task to the agent.

### `DELETE /api/tasks/:id`

Delete a task and all related records (activities, deliverables, dependencies).

### `POST /api/tasks/:id/dispatch`

Dispatch a task to the assigned agent via OpenClaw Gateway.

### `POST /api/tasks/:id/retry`

Retry a failed task. Resets status to `assigned` and increments `retry_count`.

---

## Task Activities

### `GET /api/tasks/:id/activities`

List all activities for a task, ordered by creation time.

**Response:** `TaskActivity[]` with agent details joined.

### `POST /api/tasks/:id/activities`

Log a new activity.

**Body:**
```json
{
  "activity_type": "updated",
  "message": "Task description updated",
  "agent_id": "uuid",
  "metadata": { "key": "value" }
}
```

---

## Task Deliverables

### `GET /api/tasks/:id/deliverables`

List all deliverables for a task.

### `POST /api/tasks/:id/deliverables`

Register a new deliverable.

**Body:**
```json
{
  "deliverable_type": "file",
  "title": "Report.pdf",
  "path": "/home/user/workspace/report.pdf",
  "description": "Final research report"
}
```

`deliverable_type`: `file` | `url` | `artifact`

---

## Task Dependencies

### `GET /api/tasks/:id/dependencies`

Get dependencies in both directions.

**Response:**
```json
{
  "depends_on": [{ "id": "...", "title": "...", "status": "..." }],
  "blocking": [{ "id": "...", "title": "...", "status": "..." }]
}
```

### `POST /api/tasks/:id/dependencies`

Add a dependency. Task `:id` will depend on `dependency_id`.

**Body:**
```json
{ "dependency_id": "uuid" }
```

Circular dependencies are detected and rejected.

### `DELETE /api/tasks/:id/dependencies/:depId`

Remove a dependency.

---

## Agents

### `GET /api/agents`

List all agents, sorted by master status then name.

### `POST /api/agents`

Create a new agent.

**Body:**
```json
{
  "name": "Atlas",
  "role": "Master Orchestrator",
  "description": "Coordinates all agents",
  "avatar_emoji": "🧠",
  "is_master": true,
  "model": "openrouter/stepfun/step-3.5-flash:free",
  "soul_md": "You are the master orchestrator...",
  "user_md": "User preferences...",
  "agents_md": "Team context..."
}
```

### `GET /api/agents/:id`

Get a single agent.

### `PATCH /api/agents/:id`

Update agent properties.

---

## OpenClaw Gateway

### `GET /api/openclaw/status`

Check gateway connection status.

**Response:** `{ connected: boolean }`

### `GET /api/openclaw/sessions`

List OpenClaw sessions.

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `session_type` | string | Filter by type (`persistent` or `subagent`) |
| `status` | string | Filter by status |

### `GET /api/openclaw/sessions/:id/history`

Get conversation history for a session.

**Response:** `{ history: OpenClawHistoryMessage[] }`

### `POST /api/openclaw/sessions/:id`

Send a message to a session.

**Body:** `{ content: "Hello, agent!" }`

### `GET /api/openclaw/models`

List available AI models from the gateway.

---

## Voice Calls

### `POST /api/voicecall/initiate`

Start an outbound phone call.

**Body:**
```json
{
  "agentId": "uuid",
  "phoneNumber": "+1234567890",
  "message": "Hello, this is a notification...",
  "mode": "conversation"
}
```

`mode`: `conversation` (two-way) | `notify` (speak and hang up)

### `GET /api/voicecall/calls`

List all call logs.

### `GET /api/voicecall/calls/:callId`

Get details for a specific call.

### `POST /api/voicecall/calls/:callId/continue`

Send a follow-up message in an active conversation call.

**Body:** `{ "message": "What about..." }`

### `POST /api/voicecall/calls/:callId/speak`

Speak text without expecting a response.

**Body:** `{ "message": "Thank you for your patience." }`

### `POST /api/voicecall/calls/:callId/end`

End an active call.

### `GET /api/voicecall/calls/:callId/status`

Poll current call status from the gateway.

---

## Contacts (Phonebook)

### `GET /api/contacts`

List all contacts. Optionally filter with `?q=search_term`.

### `POST /api/contacts`

Add a contact.

**Body:**
```json
{
  "name": "John Doe",
  "phone_number": "+1234567890",
  "label": "Client"
}
```

### `DELETE /api/contacts?id=uuid`

Delete a contact by ID.

---

## Events

### `GET /api/events`

List recent events.

**Query Parameters:**
| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | number | 20 | Max events to return |

### `GET /api/events/stream`

Server-Sent Events stream. Connect with `EventSource` for real-time updates.

**Event types:**
- `task_created`, `task_updated`, `task_deleted`, `task_failed`
- `activity_logged`, `deliverable_added`
- `agent_spawned`, `agent_completed`
- `dependency_changed`
- `call_started`, `call_ended`, `call_failed`

---

## Search

### `GET /api/search`

Search tasks and agents.

**Query Parameters:**
| Param | Type | Default | Description |
|---|---|---|---|
| `q` | string | *(required)* | Search query |
| `limit` | number | 20 | Max results per type |

**Response:**
```json
{
  "tasks": [...],
  "agents": [...]
}
```

Uses FTS5 full-text search with LIKE fallback for special characters.

---

## Prompts

### `GET /api/prompts`

List prompts with optional filters.

**Query Parameters:** `category`, `agent_id`, `search`

### `POST /api/prompts`

Create a prompt.

**Body:**
```json
{
  "title": "Code Review",
  "content": "Review the following code for...",
  "description": "Standard code review prompt",
  "category": "development",
  "tags": ["code", "review"],
  "variables": ["language", "focus_areas"],
  "is_template": true
}
```

### `GET /api/prompts/:id` / `PATCH /api/prompts/:id`

Get or update a single prompt.

---

## Settings

### `GET /api/settings/gateway` / `PUT /api/settings/gateway`

Read/write OpenClaw gateway connection settings.

### `GET /api/settings/rate-limit` / `PUT /api/settings/rate-limit`

Read/write rate limiting configuration.

### `GET /api/settings/voice-call` / `PUT /api/settings/voice-call`

Read/write voice call plugin settings.

### `POST /api/settings/voice-call/detect-ngrok`

Auto-detect ngrok tunnel URL from local API (`http://127.0.0.1:4040/api/tunnels`).

---

## Files

### `POST /api/files/upload`

Upload a file.

### `GET /api/files/download`

Download a file by path.

### `POST /api/files/preview`

Preview file content.

### `GET /api/files/reveal`

Open file in the system file explorer.

---

## Webhooks

### `POST /api/webhooks/agent-completion`

Webhook called by agents when a task is completed. Triggers status update and notifications.
