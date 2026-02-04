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
