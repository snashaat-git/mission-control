# Components

All components are in `src/components/`. They use Tailwind CSS with CSS custom properties for theming.

## Layout & Navigation

### Header (`Header.tsx`)
Top navigation bar with:
- Mission Control logo/title
- Search bar (SearchBar component)
- OpenClaw connection status indicator
- Theme toggle (dark/light)
- Phone call button (opens VoiceCallModal)
- New task button

### AgentsSidebar (`AgentsSidebar.tsx`)
Left sidebar displaying:
- Agent cards with avatar, name, role, status badge
- Quick action buttons per agent: Chat, Call
- "Add Agent" button (opens AgentModal)
- Agent click opens detailed AgentModal

### SearchBar (`SearchBar.tsx`)
Global search input that queries `/api/search`:
- Full-text search across tasks and agents
- Results dropdown with clickable entries
- Keyboard navigable

### Providers (`Providers.tsx`)
React context wrapper providing:
- Toast notification context
- Theme context

## Core Features

### MissionQueue (`MissionQueue.tsx`)
The main Kanban board. Key features:
- 7 status columns rendered from `TASK_STATUSES`
- Drag-and-drop via `@hello-pangea/dnd`
- Task cards with title, agent avatar, priority badge, dependency lock
- Sticky task detection (red border for long-running tasks)
- Undo bar with 5-second countdown after moves
- Template picker for quick task creation
- Auto-assign button
- Analytics panel toggle

### TaskModal (`TaskModal.tsx`)
Detailed task view/edit modal with tabs:
- **Details** — Title, description, priority, assignee, due date, notifications
- **Activity** — Timeline of task activities
- **Deliverables** — Files, URLs, artifacts

Includes:
- Status change controls
- Dispatch/retry buttons
- Dependency management
- Notification settings (phone/email on complete/fail)

### AgentModal (`AgentModal.tsx`)
Create/edit agent modal:
- Name, role, description, avatar emoji picker
- Master agent toggle
- Model override input (for OpenRouter)
- Soul MD / User MD / Agents MD text areas

### ChatModal (`ChatModal.tsx`)
Full-screen chat interface for agent conversations:
- Message history display
- Message input with send button
- Auto-scroll to latest message

## Task Details

### DeliverablesList (`DeliverablesList.tsx`)
Displays task deliverables:
- File, URL, and artifact types
- Download button for files
- Reveal in file explorer button
- Add deliverable form

### DependenciesList (`DependenciesList.tsx`)
Task dependency manager:
- "Depends On" list — tasks this task requires
- "Blocking" list — tasks waiting on this task
- Add dependency dropdown
- Remove dependency button

## Session Management

### SessionsList (`SessionsList.tsx`)
List of OpenClaw gateway sessions:
- Session type, channel, status
- Click to open session details

### SessionView (`SessionView.tsx`)
Single session detail view:
- Chat history with agent messages
- Send message form
- Polls history every 3 seconds

## Prompts

### PromptsLibrary (`PromptsLibrary.tsx`)
Prompt management interface:
- List prompts with search and category filter
- Create/edit prompts
- Template toggle
- Usage counter display

### PromptEditor (`PromptEditor.tsx`)
Markdown editor for prompt content with preview.

### TemplatePicker (`TemplatePicker.tsx`)
Pre-built task template selector:
- Grid of template cards with icons
- Click to create task from template
- Workflow templates for multi-step pipelines

## Voice

### VoiceCallModal (`VoiceCallModal.tsx`)
Phone call interface with two tabs:
- **Dial** — Phone number input, agent selector, message, call mode toggle (Conversation/Notify)
- **Contacts** — Phonebook with search, add, delete, click-to-dial

Call states: Idle → Connecting → Active (with timer) → Ended

### CallHistory (`CallHistory.tsx`)
Table of past voice calls:
- Agent, phone number, direction, status, duration
- Click for transcript details
- Filterable by agent

### VoiceInterface (`VoiceInterface.tsx`)
Voice input/output controls for speech-to-text and text-to-speech.

## Custom Hooks

### useSSE (`hooks/useSSE.ts`)
Real-time event stream subscription:
- Connects to `/api/events/stream`
- Auto-reconnects on disconnect (5s delay)
- Updates Zustand store on events
- Triggers browser notifications

### useSessionHistory (`hooks/useSessionHistory.ts`)
Poll OpenClaw session messages:
- Polls every 3 seconds
- Returns `{ messages, isLoading, error, sendMessage, isSending }`

### useNotifications (`hooks/useNotifications.ts`)
Browser notification API wrapper:
- Permission request
- Send desktop notifications
- Enable/disable toggle

### useTheme (`hooks/useTheme.ts`)
Dark/light theme toggle:
- Reads/writes `data-theme` attribute on `<html>`
- Persists to `localStorage` (`mc-theme`)

### useToast (`hooks/useToast.tsx`)
Toast notification system:
- 4 types: success, error, warning, info
- Auto-dismiss with configurable duration
- Max 5 visible toasts
