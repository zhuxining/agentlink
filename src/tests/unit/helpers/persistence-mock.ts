// src/tests/unit/helpers/persistence-mock.ts
// 使用 node 内置 SQLite（node:sqlite），避免引入 better-sqlite3 原生二进制
// 在 vitest worker（node ABI 127）下因编译目标（bun ABI 148）不匹配而无法加载的问题。
import { DatabaseSync } from "node:sqlite";

export interface MockAcpServer {
  args: string[];
  command: string;
  env?: Record<string, string>;
  id: string;
  name: string;
}

export interface MockConfigState {
  acpServers: MockAcpServer[];
  adapters: Record<string, { env: Record<string, string>; enabled: boolean }>;
}

const SCHEMA = `
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
`;

export function createMemoryDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  return db;
}

export function makePersistenceMock(db: DatabaseSync, state: MockConfigState) {
  return {
    getDatabase: () => db,
    createStateAdapter: () => ({}),
    closeDatabase: () => {
      // no-op: the in-memory database is released by GC
    },
    configStore: {
      get: (key: keyof MockConfigState) => state[key],
      set: (key: keyof MockConfigState, value: unknown) => {
        (state as unknown as Record<string, unknown>)[key] = value;
      },
    },
  };
}
