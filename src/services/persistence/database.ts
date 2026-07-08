import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { app } from "electron";

let db: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (db) {
    return db;
  }
  if (!app.isReady()) {
    throw new Error("Database cannot be accessed before app.whenReady()");
  }
  const dbPath = path.join(app.getPath("userData"), "agentlink.db");
  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      adapter TEXT NOT NULL,
      agent_id TEXT,
      acp_server_id TEXT,
      acp_session_id TEXT,
      title TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transcripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','agent')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_trans_conv ON transcripts(conversation_id, created_at);
  `);
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
