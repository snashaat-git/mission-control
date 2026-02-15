# Features Guide

## Dashboard Overview

The main dashboard has three sections:

- **Header** — Status indicators, search bar, theme toggle, voice call button
- **Agents Sidebar** (left) — Agent cards with status, role, and quick actions
- **Mission Queue** (center) — Kanban board with task cards

## Mission Queue (Kanban Board)

The Kanban board displays tasks across 7 status columns:

| Column | Description |
|---|---|
| **Inbox** | New tasks waiting to be assigned |
| **Assigned** | Tasks assigned to an agent (auto-dispatches) |
| **In Progress** | Agent is actively working |
| **Testing** | Output is being tested/validated |
| **Review** | Awaiting human review |
| **Done** | Completed successfully |
| **Failed** | Task failed (can be retried) |

### Creating Tasks

1. Click the **"+ New Task"** button in the header
2. Fill in the task details:
   - **Title** (required)
   - **Description** — Markdown supported
   - **Priority** — Low, Normal, High, Urgent
   - **Assigned Agent** — Select from the agent list
   - **Due Date** — Optional deadline
3. Click **Create**

### Using Templates

Click the template picker icon next to "New Task" to choose from pre-built templates:

- **Landing Page** — Responsive landing page project
- **Research Task** — Research and compile findings
- **Bug Fix** — Bug report with reproduction steps
- **Documentation** — Write or update docs
- **API Integration** — Third-party API integration
- **Data Analysis** — Data analysis and visualization
- **Trading Morning Routine** — Pre-session market prep

Templates pre-fill the title, description, priority, and suggested due date. Placeholders like `[Project Name]` can be customized.

### Using Workflows

Workflows create multiple linked tasks with dependencies:

- **Research > Write > Review** — Sequential content pipeline
- **Design > Develop > Test** — Feature development pipeline
- **Full Project Pipeline** — Research + Design (parallel) > Develop > Test > Documentation

### Drag and Drop

Drag task cards between columns to change their status. When a task moves to "Assigned", it is automatically dispatched to the assigned agent's OpenClaw session.

An **undo bar** appears for 5 seconds after each move, allowing you to revert accidental changes.

### Stuck Task Detection

Tasks that stay in a status too long are highlighted with a red border. Thresholds vary by status (e.g., "In Progress" tasks are flagged after extended periods).

## Task Details

Click any task card to open the Task Modal with three tabs:

### Details Tab
- Edit title, description, priority, assignee, due date
- View/change status
- Set notification preferences (phone/email on completion or failure)

### Activity Tab
- Real-time activity log showing every action on the task
- Shows: status changes, agent messages, file creations, failures, retries

### Deliverables Tab
- Files, URLs, and artifacts produced by the agent
- Download or reveal files in your file explorer
- Add deliverables manually

### Dependencies
- Add dependencies to block a task until other tasks complete
- View which tasks this task blocks
- Circular dependency detection prevents invalid chains

## Task Notifications

Each task can be configured to send notifications on completion or failure:

- **Phone** — Enter a phone number to receive a voice call (requires voice call plugin)
- **Email** — Enter an email address (requires SMTP configuration)
- **On Complete** — Notify when the task reaches "Done"
- **On Failure** — Notify when the task fails (after all retries exhausted)

Leave fields empty to disable notifications.

## Agents

### Agent Cards

The sidebar shows each agent with:
- Avatar emoji and name
- Role description
- Status badge (Standby / Working / Offline)
- Quick action buttons (Chat, Call)

### Creating Agents

Click **"+ Agent"** in the sidebar to create a new agent:

- **Name** — Display name
- **Role** — What this agent specializes in
- **Description** — Detailed capabilities
- **Avatar Emoji** — Visual identifier
- **Master Agent** — Toggle for the primary orchestrator
- **Model Override** — Use a specific AI model (e.g., `openrouter/stepfun/step-3.5-flash:free`)
- **Soul/User/Agents MD** — Context markdown injected into the agent's session

### Default Agents

| Agent | Role | Emoji |
|---|---|---|
| Atlas | Master Orchestrator | `🧠` |
| Cai | Code & Architecture | `💻` |
| Dox | Documentation | `📝` |
| Luma | Design & Creative | `🎨` |
| Vera | QA & Testing | `🔍` |

## Search

The global search bar in the header searches across:
- Task titles and descriptions (FTS5 full-text search)
- Agent names and roles

Type to search, results appear in a dropdown.

## Live Feed

The event feed shows real-time activity across all agents and tasks:
- Task created/updated/completed/failed
- Agent spawned/completed
- Deliverables added
- Voice calls started/ended

Events are delivered via Server-Sent Events (SSE) for instant updates without page refresh.

## Prompts Library

Access from the navigation to manage reusable prompts:

- **Create** prompts with title, content, description, category, and tags
- **Variables** — Define placeholders (e.g., `{{company_name}}`) for dynamic content
- **Templates** — Mark prompts as templates for team sharing
- **Search** — Find prompts by keyword, category, or agent
- **Usage Tracking** — See how often each prompt is used

## Theme

Toggle between **Dark** and **Light** mode using the sun/moon icon in the header. The preference is saved to localStorage.

## Keyboard & Accessibility

- All interactive elements are keyboard-navigable
- ARIA labels on buttons and modals
- Focus trapping in modals
- Reduced motion support via `prefers-reduced-motion`
