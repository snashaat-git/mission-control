# Database Schema

Mission Control uses **SQLite** via `better-sqlite3` with WAL mode enabled. The database file is `mission-control.db` in the project root.

Migrations run automatically on server startup.

## Tables

### agents

AI agents / team members.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | TEXT PK | — | UUID |
| `name` | TEXT NOT NULL | — | Display name |
| `role` | TEXT NOT NULL | — | Agent specialization |
| `description` | TEXT | — | Detailed capabilities |
| `avatar_emoji` | TEXT | `🤖` | Visual identifier |
| `status` | TEXT | `standby` | `standby` \| `working` \| `offline` |
| `is_master` | INTEGER | `0` | 1 = master orchestrator |
| `session_key` | TEXT | — | Custom OpenClaw session key |
| `model` | TEXT | — | AI model override (e.g. `openrouter/...`) |
| `soul_md` | TEXT | — | Soul context markdown |
| `user_md` | TEXT | — | User context markdown |
| `agents_md` | TEXT | — | Team context markdown |
| `created_at` | TEXT | `datetime('now')` | ISO timestamp |
| `updated_at` | TEXT | `datetime('now')` | ISO timestamp |

### tasks

The mission queue.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | TEXT PK | — | UUID |
| `title` | TEXT NOT NULL | — | Task title |
| `description` | TEXT | — | Markdown description |
| `status` | TEXT | `inbox` | `inbox` \| `assigned` \| `in_progress` \| `testing` \| `review` \| `done` \| `failed` |
| `priority` | TEXT | `normal` | `low` \| `normal` \| `high` \| `urgent` |
| `assigned_agent_id` | TEXT FK→agents | — | Assigned agent |
| `created_by_agent_id` | TEXT FK→agents | — | Creator agent |
| `business_id` | TEXT | `default` | Workspace identifier |
| `due_date` | TEXT | — | ISO timestamp |
| `output_dir` | TEXT | — | Output directory path |
| `retry_count` | INTEGER | `0` | Number of retry attempts |
| `max_retries` | INTEGER | `2` | Maximum retries allowed |
| `notify_settings` | TEXT | — | JSON: `{ phone, email, on_complete, on_failure }` |
| `created_at` | TEXT | `datetime('now')` | ISO timestamp |
| `updated_at` | TEXT | `datetime('now')` | ISO timestamp |

### task_activities

Real-time activity log per task.

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `task_id` | TEXT FK→tasks | Parent task |
| `agent_id` | TEXT FK→agents | Acting agent |
| `activity_type` | TEXT NOT NULL | `spawned` \| `updated` \| `completed` \| `file_created` \| `status_changed` \| `failed` \| `retried` \| `timeout` |
| `message` | TEXT NOT NULL | Human-readable description |
| `metadata` | TEXT | JSON metadata |
| `created_at` | TEXT | ISO timestamp |

### task_deliverables

Files, URLs, and artifacts produced by tasks.

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `task_id` | TEXT FK→tasks | Parent task |
| `deliverable_type` | TEXT NOT NULL | `file` \| `url` \| `artifact` |
| `title` | TEXT NOT NULL | Display name |
| `path` | TEXT | File path or URL |
| `description` | TEXT | Description |
| `created_at` | TEXT | ISO timestamp |

### task_dependencies

Many-to-many task blocking relationships.

| Column | Type | Description |
|---|---|---|
| `task_id` | TEXT FK→tasks | The task that depends on another |
| `dependency_id` | TEXT FK→tasks | The task being depended on |
| `created_at` | TEXT | ISO timestamp |

**Primary Key:** `(task_id, dependency_id)`
**Constraint:** `task_id != dependency_id` (no self-dependencies)

### conversations

Agent-to-agent or task-related conversations.

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `title` | TEXT | Conversation title |
| `type` | TEXT | `direct` \| `group` \| `task` |
| `task_id` | TEXT FK→tasks | Related task (if task conversation) |
| `created_at` | TEXT | ISO timestamp |
| `updated_at` | TEXT | ISO timestamp |

### conversation_participants

| Column | Type | Description |
|---|---|---|
| `conversation_id` | TEXT FK→conversations | |
| `agent_id` | TEXT FK→agents | |
| `joined_at` | TEXT | ISO timestamp |

**Primary Key:** `(conversation_id, agent_id)`

### messages

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `conversation_id` | TEXT FK→conversations | |
| `sender_agent_id` | TEXT FK→agents | |
| `content` | TEXT NOT NULL | Message text |
| `message_type` | TEXT | `text` \| `system` \| `task_update` \| `file` |
| `metadata` | TEXT | JSON metadata |
| `created_at` | TEXT | ISO timestamp |

### events

Global event feed.

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `type` | TEXT NOT NULL | Event type string |
| `agent_id` | TEXT FK→agents | Related agent |
| `task_id` | TEXT FK→tasks | Related task |
| `message` | TEXT NOT NULL | Human-readable description |
| `metadata` | TEXT | JSON metadata |
| `created_at` | TEXT | ISO timestamp |

### openclaw_sessions

OpenClaw gateway session mapping.

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `agent_id` | TEXT FK→agents | Linked agent |
| `openclaw_session_id` | TEXT NOT NULL | Gateway session ID |
| `channel` | TEXT | Session channel |
| `status` | TEXT | Session status |
| `session_type` | TEXT | `persistent` \| `subagent` |
| `task_id` | TEXT FK→tasks | Related task |
| `ended_at` | TEXT | When session ended |
| `created_at` | TEXT | ISO timestamp |
| `updated_at` | TEXT | ISO timestamp |

### prompts

Reusable prompt library.

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `title` | TEXT NOT NULL | Prompt title |
| `content` | TEXT NOT NULL | Prompt content (Markdown) |
| `description` | TEXT | Brief description |
| `category` | TEXT | Category (default: `general`) |
| `agent_id` | TEXT FK→agents | Specific agent (optional) |
| `tags` | TEXT | JSON array of tags |
| `variables` | TEXT | JSON array of variable names |
| `is_template` | INTEGER | 1 = reusable template |
| `usage_count` | INTEGER | Times used |
| `created_at` | TEXT | ISO timestamp |
| `updated_at` | TEXT | ISO timestamp |

### call_logs

Voice call history.

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `agent_id` | TEXT FK→agents | Agent that made/received the call |
| `session_key` | TEXT NOT NULL | OpenClaw session key |
| `call_id` | TEXT UNIQUE NOT NULL | Unique call identifier |
| `phone_number` | TEXT NOT NULL | Phone number |
| `direction` | TEXT | `inbound` \| `outbound` |
| `status` | TEXT | `initiating` \| `active` \| `ended` \| `failed` |
| `duration_seconds` | INTEGER | Call duration |
| `transcript` | TEXT | Call transcript |
| `summary` | TEXT | AI-generated summary |
| `created_at` | TEXT | ISO timestamp |
| `ended_at` | TEXT | When call ended |

### contacts

Phonebook entries.

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | Contact name |
| `phone_number` | TEXT NOT NULL | Phone number |
| `label` | TEXT | Category label |
| `created_at` | TEXT | ISO timestamp |

### businesses

Workspaces/projects.

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | Workspace name |
| `description` | TEXT | Description |
| `created_at` | TEXT | ISO timestamp |

### tasks_fts

FTS5 virtual table for full-text search over `tasks.title` and `tasks.description`. Created as a migration.

## Indexes

| Index | Table | Columns |
|---|---|---|
| `idx_tasks_status` | tasks | status |
| `idx_tasks_assigned` | tasks | assigned_agent_id |
| `idx_messages_conversation` | messages | conversation_id |
| `idx_events_created` | events | created_at DESC |
| `idx_agents_status` | agents | status |
| `idx_activities_task` | task_activities | task_id, created_at DESC |
| `idx_deliverables_task` | task_deliverables | task_id |
| `idx_openclaw_sessions_task` | openclaw_sessions | task_id |
| `idx_prompts_category` | prompts | category |
| `idx_prompts_agent` | prompts | agent_id |
| `idx_task_deps_task` | task_dependencies | task_id |
| `idx_task_deps_dep` | task_dependencies | dependency_id |
| `idx_call_logs_agent` | call_logs | agent_id, created_at DESC |
| `idx_call_logs_status` | call_logs | status |
| `idx_call_logs_call_id` | call_logs | call_id |
