# Mission Control — Recommendations Tracker

> Last updated: 2026-02-13

## Status Legend
- ✅ Done
- 🟡 Partial
- ⬜ Not Started

---

## Phase 1: Core Workflow & Reliability

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | **Task Dependencies** | ✅ Done | DB schema, API (add/list/remove), cycle detection, `DependenciesList.tsx` UI, lock badges on Kanban, SSE events |
| 2 | **Live Session View** | ✅ Done | `SessionView` component with real-time chat history (3s polling), message sending, auto-scroll. Accessible from SessionsList (click any session) and AgentsSidebar (Live View button + modal). `useSessionHistory` hook for polling/sending. |
| 3 | **Failure Detection + Retry** | ✅ Done | `failed` task status with DB migration. Watcher detects: agent offline, session failed/inactive, task timeout (configurable via `MC_TASK_TIMEOUT_MINUTES`), `TASK_FAILED:` chat pattern. Auto-retry up to `max_retries` (default 2), then marks as failed. Retry API (`POST /api/tasks/[id]/retry`), failed column in Kanban with retry button, failed banner in TaskModal, SSE `task_failed` event, activity logging for `failed`/`retried`/`timeout`. |
| 4 | **Browser Notifications** | ✅ Done | `useNotifications` hook with Notification API. Fires on: task completed, task ready for review, task failed, agent finished. Only when tab is backgrounded. Toggle in Settings page with permission management. localStorage-based enable/disable (`mc-notifications-enabled`). |
| 5 | **Workflow Templates** | ✅ Done | `WorkflowTemplate` type in `templates.ts` with 3 built-in workflows (Research→Write→Review, Design→Develop→Test, Full Project Pipeline). `POST /api/workflows` endpoint creates multiple tasks with auto-linked dependencies. TemplatePicker has Templates/Workflows tabs, step visualization with dependency arrows, placeholder form, and batch task creation. |

---

## Phase 2: Quality of Life & Performance

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 6 | **Full-Text Search (FTS5)** | ✅ Done | FTS5 virtual table on tasks (title, description) with auto-sync triggers. `GET /api/search?q=` endpoint with FTS5 MATCH + LIKE fallback for agents. `SearchBar` component with debounced search, dropdown results (tasks with status badges + agents), keyboard navigation (arrows, Enter, Escape). Integrated into main page toolbar. |
| 7 | **Error Boundaries** | ⬜ Not Started | React Error Boundary wrappers around MissionQueue, TaskModal, and other key sections |
| 8 | **Structured Logging** | ⬜ Not Started | Replace 211 `console.log` calls with pino/winston logger |
| 9 | **Kanban Performance** | ✅ Done | `TaskCard` wrapped in `React.memo`, `tasksByStatus` grouped via `useMemo`, `handleDragStart`/`handleDragOver` wrapped in `useCallback`, `PRIORITY_COLORS` + `formatStuckTime` + `getStuckInfo` lifted to module-level constants/functions. |
| 10 | **Export / Reports** | ⬜ Not Started | CSV/PDF export for tasks and activity logs |

---

## Phase 3: Advanced Features

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 11 | **Sub-tasks / Task Hierarchy** | ⬜ Not Started | `parent_task_id` column for parent-child breakdown |
| 12 | **Scheduled / Recurring Tasks** | ⬜ Not Started | Cron-style schedule field for automated routines |
| 13 | **Task Templates from Prompts** | ⬜ Not Started | Bridge Prompts Library → auto-create tasks |
| 14 | **API Rate Limiting** | ✅ Done | Next.js middleware with in-memory sliding window rate limiter. Three tiers: Strict (20 req/min — search, enhance, upload), Standard (60 req/min — CRUD endpoints), Relaxed (120 req/min — polling endpoints). SSE exempt. Returns 429 with `X-RateLimit-*` and `Retry-After` headers. Auto-cleanup of expired entries every 60s. |
| 15 | **Unit Tests** | ⬜ Not Started | Jest + React Testing Library for DB layer and API routes |

---

## Phase 4: UI Polish & Accessibility

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 16 | **Empty States in Kanban** | ✅ Done | Empty columns show contextual emoji + "No tasks" message. During drag, target columns get dashed border highlight + "Drop here" text. |
| 17 | **Global Toast System** | ✅ Done | `useToast` hook + `ToastProvider` in layout. Replaced all 17 `alert()` calls across MissionQueue, TaskModal, DeliverablesList, AgentsSidebar. Four toast types: success (green), error (red), warning (yellow), info (blue). Auto-dismiss, max 5 stacked, slide-in animation. |
| 18 | **Drag-and-Drop Visual Feedback** | ✅ Done | During drag: target columns get accent border glow + subtle box-shadow, column header text turns accent blue, task area shows dashed border + "Drop here" on empty columns. Source column stays neutral. |
| 19 | **Skeleton Loaders** | ✅ Done | Replaced emoji spinner with full structural skeleton: header bar with pulse placeholders, sidebar with 5 agent avatar+text skeletons, kanban grid with 6 columns each containing varying card placeholders. All use `animate-pulse` with `mc-bg-tertiary` color tokens. |
| 20 | **Accessibility (ARIA & Focus)** | ✅ Done | `aria-label` on all icon-only buttons (Header, TaskModal, PromptsLibrary, AgentModal, ChatModal, VoiceInterface, SearchBar, AgentsSidebar). `role="dialog"` + `aria-modal="true"` + `aria-labelledby` on all 7 modals. Global `focus-visible` ring via CSS. `prefers-reduced-motion: reduce` media query disables all animations. Skip-to-content link in layout with `#main-content` target. |
| 21 | **Mobile Responsiveness** | ✅ Done | Collapsible sidebar with slide-over drawer on mobile (overlay + shadow), auto-hides below 768px. Sidebar toggle button in toolbar (md:hidden). Modals use `p-2 sm:p-4` and `max-h-[95vh]` on mobile. Kanban columns `min-w-[140px]` on mobile. Live Feed hidden on mobile. 44px min touch targets via global CSS `@media (max-width: 767px)`. Toolbar buttons have `min-h-[44px]` on mobile. |
| 22 | **Dark/Light Mode Toggle** | ✅ Done | Light theme CSS variables via `[data-theme="light"]` selector. `useTheme` hook with localStorage persistence (`mc-theme` key). Theme toggle in Settings page (Appearance section) with Dark/Light buttons. Inline `<script>` in layout prevents flash of wrong theme. All colors use CSS variables so theme switch is instant and complete. |
