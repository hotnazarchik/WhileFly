import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type DB = DatabaseSync;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  callsign      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  bio           TEXT NOT NULL DEFAULT '',
  drones_json   TEXT NOT NULL DEFAULT '[]',
  stats_json    TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);

-- one row per pair; requester -> addressee. status: 'pending' | 'accepted'
CREATE TABLE IF NOT EXISTS friendships (
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (requester_id, addressee_id)
);

CREATE TABLE IF NOT EXISTS chats (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,             -- 'direct' | 'group'
  title      TEXT NOT NULL DEFAULT '',
  direct_key TEXT UNIQUE,               -- "minId:maxId" for direct chats
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id      INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_id INTEGER NOT NULL DEFAULT 0,
  joined_at    INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id      INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id    INTEGER NOT NULL REFERENCES users(id),
  kind         TEXT NOT NULL,           -- 'text' | 'log' | 'system'
  text         TEXT NOT NULL DEFAULT '',
  payload_json TEXT,
  created_at   INTEGER NOT NULL
);

-- uploaded files (crash photos, blackbox logs); stored on disk under data/uploads/<id>
CREATE TABLE IF NOT EXISTS uploads (
  id         TEXT PRIMARY KEY,           -- random, unguessable
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,              -- 'photo' | 'log'
  mime       TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  size       INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);
CREATE INDEX IF NOT EXISTS idx_members_user ON chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;

/** Additive column migrations for databases created by older versions. */
const COLUMNS: [table: string, column: string, ddl: string][] = [['users', 'about_json', "TEXT NOT NULL DEFAULT '{}'"]];

export function openDb(file: string): DB {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  for (const [table, column, ddl] of COLUMNS) {
    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
  return db;
}

/** Run fn inside a transaction. */
export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
