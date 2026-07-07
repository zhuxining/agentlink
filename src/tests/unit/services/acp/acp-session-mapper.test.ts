// src/tests/unit/services/acp/acp-session-mapper.test.ts

import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AcpSessionMapper } from "@/services/acp/acp-session-mapper";
import type { MockConfigState } from "@/tests/unit/helpers/persistence-mock";

// Share the in-memory DB between the persistence mock and the test body so
// seeded/inspected rows hit the exact same `getDatabase()` instance the mapper
// uses. The factory assigns the created DB into this hoisted holder.
const mocks = vi.hoisted(() => ({
  db: null as unknown as DatabaseSync,
  state: { adapters: {}, acpServers: [] } as MockConfigState,
}));

vi.mock("@/services/persistence", async () => {
  const { createMemoryDatabase, makePersistenceMock } = await import(
    "@/tests/unit/helpers/persistence-mock"
  );
  mocks.db = createMemoryDatabase();
  return makePersistenceMock(mocks.db, mocks.state);
});

const db = mocks.db;

function seedConversation(id: string): void {
  db.prepare(
    "INSERT INTO conversations (id, adapter, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, "telegram", "", Date.now(), Date.now());
}

beforeEach(() => {
  db.exec("DELETE FROM conversations");
  db.exec("DELETE FROM transcripts");
});

describe("AcpSessionMapper", () => {
  it("findByThreadId returns null when no conversation exists", () => {
    expect(new AcpSessionMapper().findByThreadId("t_missing")).toBeNull();
  });

  it("findByThreadId returns null when session is closed (acp_session_id NULL)", () => {
    seedConversation("t1");
    const m = new AcpSessionMapper();
    m.createMapping({
      threadId: "t1",
      acpServerId: "s1",
      acpSessionId: "sess1",
      agentId: "default",
    });
    m.closeSession("t1");
    expect(m.findByThreadId("t1")).toBeNull();
  });

  it("createMapping persists and findByThreadId returns the record", () => {
    seedConversation("t1");
    const m = new AcpSessionMapper();
    const rec = m.createMapping({
      threadId: "t1",
      acpServerId: "s1",
      acpSessionId: "sess1",
      agentId: "a1",
    });
    expect(rec).toEqual({
      threadId: "t1",
      acpServerId: "s1",
      acpSessionId: "sess1",
      agentId: "a1",
    });
    expect(m.findByThreadId("t1")).toEqual({
      threadId: "t1",
      acpServerId: "s1",
      acpSessionId: "sess1",
      agentId: "a1",
    });
  });

  it("closeSession nulls the session id", () => {
    seedConversation("t1");
    const m = new AcpSessionMapper();
    m.createMapping({
      threadId: "t1",
      acpServerId: "s1",
      acpSessionId: "sess1",
      agentId: "a1",
    });
    m.closeSession("t1");
    const row = db
      .prepare("SELECT acp_session_id FROM conversations WHERE id=?")
      .get("t1") as { acp_session_id: unknown };
    expect(row.acp_session_id).toBeNull();
  });
});
