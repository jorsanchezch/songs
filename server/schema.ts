export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
  password_hash TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  composer TEXT NOT NULL DEFAULT '',
  key_name TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  lyrics_text TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL CHECK (origin IN ('catalog', 'local', 'copy')),
  catalog_id TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  shared INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  catalog_source TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS instrument_parts (
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  instrument TEXT NOT NULL CHECK (instrument IN ('electric_guitar', 'guitar', 'bass', 'drums', 'piano')),
  source_text TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (song_id, instrument)
);

CREATE TABLE IF NOT EXISTS song_shares (
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (song_id, user_id)
);

CREATE TABLE IF NOT EXISTS service_days (
  weekday INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS setlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  evergreen_weekday INTEGER,
  service_date TEXT,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS setlist_items (
  setlist_id TEXT NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  song_id TEXT NOT NULL,
  semitones INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (setlist_id, position)
);

CREATE TABLE IF NOT EXISTS day_list_history (
  id TEXT PRIMARY KEY,
  weekday INTEGER NOT NULL,
  service_date TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS day_list_history_items (
  history_id TEXT NOT NULL REFERENCES day_list_history(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  song_id TEXT NOT NULL,
  semitones INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (history_id, position)
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  semitones TEXT NOT NULL DEFAULT '{}',
  chord_shapes TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS deleted_songs (
  id TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_songs_owner ON songs(owner_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`

export const OWNER_ID = 'jorge'
export const OWNER_NAME = 'Jorge Sanchez'
