-- Optional first-party analytics. This table contains no diary or contact data.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B', 'C')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS events_type_date ON events(event_type, created_at);
