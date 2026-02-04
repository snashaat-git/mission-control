-- Migration: Antigravity Bridge Integration
-- Adds support for dispatching tasks to Google Antigravity platform

-- Create table to track Antigravity task dispatches
CREATE TABLE IF NOT EXISTS antigravity_tasks (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  workspace_url TEXT,
  workspace_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, dispatched, in_progress, complete, error
  prompt TEXT NOT NULL,
  expected_artifacts TEXT, -- JSON array: ["screenshot", "recording", "code"]
  artifacts TEXT, -- JSON array of artifact objects
  output_dir TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_antigravity_task_id ON antigravity_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_antigravity_status ON antigravity_tasks(status);

-- Migration notes:
-- 1. This enables the Antigravity Bridge agent to dispatch tasks
-- 2. Artifacts are stored as JSON and synced to the task's output_dir
-- 3. Status is polled every 10s when task is in progress
-- 4. Delete cascade removes antigravity records when task is deleted
-- 5. No data migration needed - this is a new feature
