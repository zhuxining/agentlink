// src/tests/unit/helpers/persistence-mock.ts
import { DatabaseSync } from "node:sqlite";

export interface PersistenceMock {
  closeDatabase: () => void;
  configStore: {
    get: (
      key: keyof MockConfigState
    ) => MockConfigState[keyof MockConfigState] | undefined;
    set: (key: keyof MockConfigState, value: unknown) => void;
  };
  createStateAdapter: () => Record<string, never>;
  getDatabase: () => DatabaseSync;
}

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
  // 与 production（database.ts: pragma("foreign_keys = ON")）保持一致，
  // 让 mock 的引用完整性、级联删除行为贴近真实库。
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

export function makePersistenceMock(
  db: DatabaseSync,
  state: MockConfigState
): PersistenceMock {
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
