import Database from 'better-sqlite3';
import path from 'path';
import { schema } from './schema';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'mission-control.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Initialize schema
    db.exec(schema);

    // Run migrations for existing databases
    runMigrations(db);

    // Start background watchers (server-side only)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { startTaskCompletionWatcher } = require('../task-completion-watcher');
      startTaskCompletionWatcher();
    } catch (e) {
      console.warn('[Watcher] Failed to start task completion watcher:', e);
    }
  }
  return db;
}

/**
 * Run database migrations for schema updates
 */
function runMigrations(db: Database.Database): void {
  // Migration: Add model column to agents table (per-agent model override)
  try {
    const cols = db.prepare(`PRAGMA table_info(agents)`).all() as any[];
    const hasModelColumn = cols.some((c) => c?.name === 'model');
    if (!hasModelColumn) {
      console.log('[DB Migration] Adding agents.model column...');
      db.exec(`ALTER TABLE agents ADD COLUMN model TEXT;`);
    }
  } catch (e) {
    console.log('[DB Migration] model column migration skipped/failed:', e);
  }

  // Migration: Add output_dir column to tasks table (store computed deliverables dir)
  try {
    const cols = db.prepare(`PRAGMA table_info(tasks)`).all() as any[];
    const hasOutputDir = cols.some((c) => c?.name === 'output_dir');
    if (!hasOutputDir) {
      console.log('[DB Migration] Adding tasks.output_dir column...');
      db.exec(`ALTER TABLE tasks ADD COLUMN output_dir TEXT;`);
    }
  } catch (e) {
    console.log('[DB Migration] output_dir migration skipped/failed:', e);
  }

  // Migration: Add 'testing' status to tasks table
  // SQLite doesn't support altering CHECK constraints directly,
  // so we need to recreate the table or update the constraint.
  // For safety, we'll update any tasks with invalid status and
  // the new schema will be applied on fresh databases.
  // Existing databases with the old CHECK constraint will still work
  // because SQLite only enforces CHECK on INSERT/UPDATE, not SELECT.

  // Check if migration is needed by testing if 'testing' status works
  try {
    // Try to insert and immediately delete a test row with 'testing' status
    // If the CHECK constraint fails, we need to recreate the table
    const testResult = db.prepare(`
      SELECT sql FROM sqlite_master
      WHERE type='table' AND name='tasks'
    `).get() as { sql: string } | undefined;

    if (testResult?.sql && !testResult.sql.includes("'testing'")) {
      console.log('[DB Migration] Updating tasks table to support testing status...');

      // SQLite migration: Create new table, copy data, swap
      db.exec(`
        -- Create new tasks table with updated CHECK constraint
        CREATE TABLE IF NOT EXISTS tasks_new (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'inbox' CHECK (status IN ('inbox', 'assigned', 'in_progress', 'testing', 'review', 'done')),
          priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
          assigned_agent_id TEXT REFERENCES agents(id),
          created_by_agent_id TEXT REFERENCES agents(id),
          business_id TEXT DEFAULT 'default',
          due_date TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        -- Copy existing data
        INSERT INTO tasks_new SELECT * FROM tasks;

        -- Drop old table
        DROP TABLE tasks;

        -- Rename new table
        ALTER TABLE tasks_new RENAME TO tasks;

        -- Recreate indexes
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_agent_id);
      `);

      console.log('[DB Migration] Tasks table updated successfully');
    }
  } catch (error) {
    // Migration not needed or already applied
    console.log('[DB Migration] No migration needed or already applied');
  }

  // Migration: Add retry_count and max_retries columns to tasks
  try {
    const taskCols = db.prepare(`PRAGMA table_info(tasks)`).all() as any[];
    const hasRetryCount = taskCols.some((c) => c?.name === 'retry_count');
    if (!hasRetryCount) {
      console.log('[DB Migration] Adding tasks.retry_count and tasks.max_retries columns...');
      db.exec(`ALTER TABLE tasks ADD COLUMN retry_count INTEGER DEFAULT 0;`);
      db.exec(`ALTER TABLE tasks ADD COLUMN max_retries INTEGER DEFAULT 2;`);
    }
  } catch (e) {
    console.log('[DB Migration] retry columns migration skipped/failed:', e);
  }

  // Migration: Add 'failed' to tasks status CHECK constraint
  try {
    const testResult = db.prepare(`
      SELECT sql FROM sqlite_master
      WHERE type='table' AND name='tasks'
    `).get() as { sql: string } | undefined;

    if (testResult?.sql && !testResult.sql.includes("'failed'")) {
      console.log('[DB Migration] Updating tasks table to support failed status...');
      db.exec(`
        CREATE TABLE IF NOT EXISTS tasks_new2 (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'inbox' CHECK (status IN ('inbox', 'assigned', 'in_progress', 'testing', 'review', 'done', 'failed')),
          priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
          assigned_agent_id TEXT REFERENCES agents(id),
          created_by_agent_id TEXT REFERENCES agents(id),
          business_id TEXT DEFAULT 'default',
          due_date TEXT,
          output_dir TEXT,
          retry_count INTEGER DEFAULT 0,
          max_retries INTEGER DEFAULT 2,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        INSERT INTO tasks_new2 (id, title, description, status, priority, assigned_agent_id, created_by_agent_id, business_id, due_date, output_dir, retry_count, max_retries, created_at, updated_at)
          SELECT id, title, description, status, priority, assigned_agent_id, created_by_agent_id, business_id, due_date, output_dir,
                 COALESCE(retry_count, 0), COALESCE(max_retries, 2), created_at, updated_at
          FROM tasks;
        DROP TABLE tasks;
        ALTER TABLE tasks_new2 RENAME TO tasks;
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_agent_id);
      `);
      console.log('[DB Migration] Tasks table updated with failed status');
    }
  } catch (error) {
    console.log('[DB Migration] failed status migration skipped:', error);
  }

  // Migration: Create task_dependencies table
  try {
    const tableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='task_dependencies'`
    ).get();
    if (!tableExists) {
      console.log('[DB Migration] Creating task_dependencies table...');
      db.exec(`
        CREATE TABLE IF NOT EXISTS task_dependencies (
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          dependency_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          created_at TEXT DEFAULT (datetime('now')),
          PRIMARY KEY (task_id, dependency_id),
          CHECK (task_id != dependency_id)
        );
        CREATE INDEX IF NOT EXISTS idx_task_deps_task ON task_dependencies(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_deps_dep ON task_dependencies(dependency_id);
      `);
      console.log('[DB Migration] task_dependencies table created');
    }
  } catch (e) {
    console.log('[DB Migration] task_dependencies migration skipped/failed:', e);
  }

  // Migration: Create FTS5 virtual table for full-text search on tasks
  try {
    const ftsExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='tasks_fts'`
    ).get();
    if (!ftsExists) {
      console.log('[DB Migration] Creating FTS5 index for tasks...');
      db.exec(`
        CREATE VIRTUAL TABLE tasks_fts USING fts5(
          title, description, content=tasks, content_rowid=rowid
        );

        -- Triggers to keep FTS index in sync with tasks table
        CREATE TRIGGER tasks_fts_insert AFTER INSERT ON tasks BEGIN
          INSERT INTO tasks_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
        END;
        CREATE TRIGGER tasks_fts_delete AFTER DELETE ON tasks BEGIN
          INSERT INTO tasks_fts(tasks_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
        END;
        CREATE TRIGGER tasks_fts_update AFTER UPDATE ON tasks BEGIN
          INSERT INTO tasks_fts(tasks_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
          INSERT INTO tasks_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
        END;

        -- Rebuild to index existing rows
        INSERT INTO tasks_fts(tasks_fts) VALUES ('rebuild');
      `);
      console.log('[DB Migration] FTS5 index created and populated');
    }
  } catch (e) {
    console.log('[DB Migration] FTS5 migration skipped/failed:', e);
  }

  // Migration: Create call_logs table for voice calls
  try {
    const tableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='call_logs'`
    ).get();
    if (!tableExists) {
      console.log('[DB Migration] Creating call_logs table...');
      db.exec(`
        CREATE TABLE IF NOT EXISTS call_logs (
          id TEXT PRIMARY KEY,
          agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
          session_key TEXT NOT NULL,
          call_id TEXT NOT NULL UNIQUE,
          phone_number TEXT NOT NULL,
          direction TEXT DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
          status TEXT DEFAULT 'initiating' CHECK (status IN ('initiating', 'active', 'ended', 'failed')),
          duration_seconds INTEGER DEFAULT 0,
          transcript TEXT,
          summary TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          ended_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_call_logs_agent ON call_logs(agent_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_call_logs_status ON call_logs(status);
        CREATE INDEX IF NOT EXISTS idx_call_logs_call_id ON call_logs(call_id);
      `);
      console.log('[DB Migration] call_logs table created');
    }
  } catch (e) {
    console.log('[DB Migration] call_logs migration skipped/failed:', e);
  }

  // Migration: Create contacts table for phonebook
  try {
    const tableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='contacts'`
    ).get();
    if (!tableExists) {
      console.log('[DB Migration] Creating contacts table...');
      db.exec(`
        CREATE TABLE IF NOT EXISTS contacts (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          phone_number TEXT NOT NULL,
          label TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
      `);
      console.log('[DB Migration] contacts table created');
    }
  } catch (e) {
    console.log('[DB Migration] contacts migration skipped/failed:', e);
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Type-safe query helpers
export function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql);
  return stmt.all(...params) as T[];
}

export function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  const stmt = getDb().prepare(sql);
  return stmt.get(...params) as T | undefined;
}

export function run(sql: string, params: unknown[] = []): Database.RunResult {
  const stmt = getDb().prepare(sql);
  return stmt.run(...params);
}

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  return db.transaction(fn)();
}
