# Antigravity Bridge Integration

Bridge between OpenClaw Mission Control and Google Antigravity agentic development platform.

## Overview

**Gravity Bridge** is an agent that dispatches coding/UI tasks to Google Antigravity and syncs artifacts (screenshots, recordings, code) back to OpenClaw's Mission Control.

### When to Use

✅ **Use Antigravity for:**
- UI/frontend work needing visual verification
- Multi-file codebases requiring IDE context
- Browser testing and verification
- Complex implementations needing iteration
- Tasks where screenshots prove completion

❌ **Don't use for:**
- Single file changes (overhead)
- Non-coding tasks (research, writing)
- Quick shell commands

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Mission Control │────▶│ Gravity     │────▶│  Google          │
│                  │     │ Bridge      │     │  Antigravity     │
│  - Task assigned │     │ Agent       │     │                  │
│  - Workflows     │     │             │     │  - IDE           │
│  - Deliverables  │◀────│             │◀────│  - Browser       │
└─────────────────┘     └──────────────┘     │  - Artifacts     │
                                             └──────────────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  Artifact Sync   │
                    │  - Screenshots   │
                    │  - Recordings    │
                    │  - Code files    │
                    └──────────────────┘
```

## Components

### 1. Agent Configuration
Location: `/Users/snashaat/Projects/workspace/agents/antigravity-bridge/`

- **SOUL.md** - Agent identity, philosophy, decision framework
- **USER.md** - How the agent works with Sherif
- **AGENTS.md** - Collaboration with other agents (Web Developer, etc.)

### 2. API Endpoints

#### Dispatch Task
```
POST /api/agents/antigravity/dispatch
{
  "task_id": "uuid",
  "prompt": "Create a landing page for...",
  "workspace_name": "optional-custom-name",
  "expected_artifacts": ["screenshot", "recording", "code"],
  "output_dir": "~/openclaw/workspace/projects/example"
}
```

#### Check Status
```
GET /api/agents/antigravity/status/[taskId]
Returns:
{
  "status": "in_progress",
  "workspace": { "name": "...", "url": "..." },
  "progress": {
    "expected_artifacts": ["screenshot"],
    "found_artifacts": 2,
    "artifacts": [...]
  }
}
```

### 3. Database Schema

```sql
CREATE TABLE antigravity_tasks (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  workspace_url TEXT,
  workspace_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  prompt TEXT NOT NULL,
  expected_artifacts TEXT, -- JSON array
  artifacts TEXT, -- JSON array
  output_dir TEXT,
  error_message TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

## Implementation Status

### ✅ Complete
- [x] Agent configuration (SOUL, USER, AGENTS docs)
- [x] API endpoint structure
- [x] Database schema
- [x] Type definitions

### 🚧 Needs Implementation
- [ ] Browser automation for Antigravity interaction
- [ ] Authentication with Google Antigravity
- [ ] Artifact polling and download logic
- [ ] File sync to OpenClaw directories
- [ ] UI components for status monitoring
- [ ] Error handling and retry logic

## Browser Automation Options

Since Antigravity is web-based, integration requires browser automation:

### Option A: Puppeteer/Playwright
```typescript
// Open Antigravity workspace
const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto('https://antigravity.google/workspaces/new');

// Authenticate
await page.type('[name="email"]', process.env.ANTIGRAVITY_EMAIL);
// ... OAuth flow

// Submit prompt to agent
await page.type('.agent-input', prompt);
await page.click('.submit-button');

// Poll for artifacts
setInterval(async () => {
  const artifacts = await page.evaluate(() => {
    return document.querySelectorAll('.artifact-item');
  });
  // Download and sync
}, 30000);
```

### Option B: API Integration (Preferred)
If/when Antigravity releases an API:
```typescript
const response = await fetch('https://api.antigravity.google/v1/tasks', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ prompt, workspace })
});
```

### Option C: Webhook Integration
Configure Antigravity to POST artifact updates to OpenClaw:
```
Antigravity ──artifact created──▶ POST /api/agents/antigravity/webhook
                                    │
                                    ▼
                              Download & Sync
```

## Agent Workflow

1. **Receive** task from Mission Control (assigned to Gravity Bridge)
2. **Assess** if Antigravity is appropriate (complexity check)
3. **Dispatch** create workspace, submit prompt
4. **Monitor** poll every 30s for artifacts
5. **Capture** download screenshots, recordings
6. **Sync** place files in task's output_dir
7. **Report** update Mission Control with artifact links
8. **Complete** when Antigravity marks done + artifacts synced

## Collaboration Matrix

| Task Type | Primary Agent | Bridge Role |
|-----------|---------------|-------------|
| Simple landing page | 🎨 Web Developer | Not needed |
| Complex multi-page site | 🌉 Gravity Bridge | Full delegation |
| UI bug fix | 🌉 Gravity Bridge | Screenshot verification |
| Research | 🔍 Researcher | Not applicable |
| Backend API | 👨‍💻 Developer | Not applicable |
| Content writing | ✍️ Writer | Not applicable |

## Future Enhancements

1. **Bidirectional Sync**
   - Edit in Antigravity → sync back to OpenClaw
   - Local changes → push to Antigravity

2. **Artifact Intelligence**
   - AI analysis of screenshots (detect issues)
   - Recording summaries (extract key moments)

3. **Multi-Agent Orchestration**
   - Antigravity builds UI
   - OpenClaw agents add backend
   - Coordinated via Gravity Bridge

4. **Cost/Usage Tracking**
   - Monitor Antigravity usage
   - Optimize routing decisions

## Testing

Add agent to Mission Control:
```sql
INSERT INTO agents (id, name, role, description, avatar_emoji, is_master, status)
VALUES (
  'uuid',
  'Gravity Bridge',
  'Antigravity Dispatcher',
  'Dispatches coding/UI tasks to Google Antigravity and syncs artifacts back',
  '🌉',
  0,
  'standby'
);
```

Test workflow:
1. Create task: "Build animated landing page"
2. Assign to Gravity Bridge agent
3. Agent dispatches to Antigravity
4. Monitor artifacts in Mission Control
5. Review synced files in output_dir

## References

- [Google Antigravity Announcement](https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/)
- [Antigravity Codelabs](https://codelabs.developers.google.com/getting-started-google-antigravity)
- Agent configs: `~/Projects/workspace/agents/antigravity-bridge/`
