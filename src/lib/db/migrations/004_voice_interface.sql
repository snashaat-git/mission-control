-- Migration: Voice Interface Support
-- Adds tables for voice command history and preferences

-- Voice command history
CREATE TABLE IF NOT EXISTS voice_commands (
  id TEXT PRIMARY KEY,
  raw_text TEXT NOT NULL,
  parsed_type TEXT,
  confidence REAL DEFAULT 0,
  params TEXT, -- JSON object
  successful BOOLEAN DEFAULT NULL, -- Whether command was executed successfully
  error_message TEXT,
  user_id TEXT,
  session_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Voice user preferences
CREATE TABLE IF NOT EXISTS voice_preferences (
  user_id TEXT PRIMARY KEY,
  enabled BOOLEAN DEFAULT 1,
  voice_id TEXT DEFAULT 'en_US-lessac-high',
  voice_speed REAL DEFAULT 1.0,
  voice_pitch REAL DEFAULT 1.0,
  auto_speak_responses BOOLEAN DEFAULT 1,
  wake_word TEXT DEFAULT 'Hey Mission',
  continuous_listening BOOLEAN DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Voice shortcuts (custom command mappings)
CREATE TABLE IF NOT EXISTS voice_shortcuts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  shortcut_name TEXT NOT NULL,
  trigger_phrases TEXT, -- JSON array of phrases
  action_type TEXT NOT NULL,
  action_params TEXT, -- JSON object
  is_active BOOLEAN DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_voice_commands_user ON voice_commands(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_commands_created ON voice_commands(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_commands_type ON voice_commands(parsed_type);

-- Insert default preferences for existing users (if any)
INSERT OR IGNORE INTO voice_preferences (user_id) VALUES ('default');

-- Migration notes:
-- 1. Voice commands are stored for analytics and improvement
-- 2. Preferences allow per-user customization
-- 3. Shortcuts enable custom voice commands
-- 4. All audio files are stored in public/audio/tts/ (not in DB)
-- 5. TTS uses sherpa-onnx with Piper voices locally
