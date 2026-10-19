CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  ua TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  standalone INTEGER NOT NULL DEFAULT 0,
  country TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  sessions INTEGER NOT NULL DEFAULT 1,
  active_ms INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_device ON sessions (device_id, started_at);
