-- MUST Odoo Academic Implementation Tracker — Schema (SQLite3)

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    UNIQUE NOT NULL,
  password_hash TEXT    NOT NULL,
  display_name  TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK(role IN ('admin','registrar','coe','vc','dean')),
  email         TEXT,
  active        INTEGER DEFAULT 1,
  must_change_password INTEGER DEFAULT 1,
  created_at    TEXT    DEFAULT (datetime('now')),
  last_login    TEXT
);

CREATE TABLE IF NOT EXISTS phases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  phase_number  INTEGER UNIQUE NOT NULL,
  title         TEXT    NOT NULL,
  subtitle      TEXT    DEFAULT '',
  timeline      TEXT    DEFAULT '',
  note          TEXT    DEFAULT '',
  urgent        INTEGER DEFAULT 0,
  sort_order    INTEGER DEFAULT 0,
  created_at    TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  phase_id      INTEGER NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  label         TEXT    NOT NULL,
  category      TEXT    NOT NULL CHECK(category IN ('policy','doc','odoo','action','authority')),
  status        TEXT    NOT NULL DEFAULT 'not-started' CHECK(status IN ('not-started','in-progress','done')),
  section_label TEXT    DEFAULT '',
  sort_order    INTEGER DEFAULT 0,
  completed_date TEXT,
  completed_by  TEXT,
  note          TEXT    DEFAULT '',
  created_at    TEXT    DEFAULT (datetime('now')),
  updated_at    TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS forwarded_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  forward_type    TEXT    NOT NULL CHECK(forward_type IN ('approval','action')),
  title           TEXT    NOT NULL,
  description     TEXT    DEFAULT '',
  forwarded_by    INTEGER NOT NULL REFERENCES users(id),
  forwarded_to    TEXT    NOT NULL,
  forwarded_at    TEXT    DEFAULT (datetime('now')),
  status          TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','noted','rejected','done','declined')),
  responded_at    TEXT,
  response_note   TEXT    DEFAULT '',
  file_name       TEXT    DEFAULT NULL,
  file_data       TEXT    DEFAULT NULL,
  file_type       TEXT    DEFAULT NULL,
  due_date        TEXT    DEFAULT NULL,
  dismissed       INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id),
  action        TEXT    NOT NULL,
  entity_type   TEXT,
  entity_id     INTEGER,
  old_value     TEXT,
  new_value     TEXT,
  created_at    TEXT    DEFAULT (datetime('now'))
);
