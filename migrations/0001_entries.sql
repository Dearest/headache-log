CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  day TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  synced_at INTEGER NOT NULL
);
CREATE INDEX idx_entries_synced ON entries (synced_at);
