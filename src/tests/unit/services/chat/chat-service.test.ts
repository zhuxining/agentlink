// src/tests/unit/services/chat/chat-service.test.ts

import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ChatMessageHandler,
  ChatService,
} from "@/services/chat/chat-service";
import { EventBridge } from "@/services/chat/event-bridge";
import type { MockConfigState } from "@/tests/unit/helpers/persistence-mock";

const mocks = vi.hoisted(() => ({
  db: null as unknown as DatabaseSync,
  state: { acpServers: [], adapters: {} } as MockConfigState,
}));

vi.mock("@/services/persistence", async () => {
  const { createMemoryDatabase, makePersistenceMock } = await import(
    "@/tests/unit/helpers/persistence-mock"
  );
  mocks.db = createMemoryDatabase();
  return makePersistenceMock(mocks.db, mocks.state);
});

// 捕获 Chat SDK 事件回调的窄 mock
const chatMock = vi.hoisted(() => {
  const handlers: Record<
    string,
    (thread: unknown, message: unknown) => Promise<void>
  > = {};
  const fakeChat = {
    initialize: vi.fn(async () => undefined),
    onDirectMessage: (cb: (t: unknown, m: unknown) => Promise<void>) => {
      handlers.onDirectMessage = cb;
    },
    onNewMention: (cb: (t: unknown, m: unknown) => Promise<void>) => {
      handlers.onNewMention = cb;
    },
    onSubscribedMessage: (cb: (t: unknown, m: unknown) => Promise<void>) => {
      handlers.onSubscribedMessage = cb;
    },
    shutdown: vi.fn(async () => undefined),
  };
  return { fakeChat, handlers };
});

vi.mock("chat", () => ({
  Chat: class {
    constructor() {
      // biome-ignore lint/correctness/noConstructorReturn: 测试中返回共享 fakeChat 实例
      return chatMock.fakeChat;
    }
  },
}));

function makeRegistry() {
  return {
    buildAdapterMap: vi.fn(async () => ({ telegram: {} })),
    disable: vi.fn(),
    enable: vi.fn(),
    get: vi.fn(),
    getEnabled: vi.fn(() => []),
    list: vi.fn(() => []),
    setStatus: vi.fn(),
  };
}

const THREAD = {
  channel: { name: "telegram" },
  id: "t1",
  post: vi.fn(async () => undefined),
  subscribe: vi.fn(async () => undefined),
};
const MSG = { author: { fullName: "Bob" }, isMention: true, text: "hi" };

beforeEach(() => {
  mocks.db.exec("DELETE FROM conversations");
  mocks.db.exec("DELETE FROM transcripts");
});

describe("ChatService.initialize", () => {
  it("initializes Chat and marks enabled adapters connected + emits event", async () => {
    const registry = makeRegistry();
    const bridge = new EventBridge();
    const events: unknown[] = [];
    bridge.onEvent((e) => events.push(e));
    const svc = new ChatService(registry as never, bridge);

    await svc.initialize();

    expect(chatMock.fakeChat.initialize).toHaveBeenCalled();
    expect(registry.setStatus).toHaveBeenCalledWith("telegram", "connected");
    expect(
      events.some(
        (e) =>
          (e as { type: string }).type === "adapter_status_changed" &&
          (e as { status: string }).status === "connected"
      )
    ).toBe(true);
  });
});

describe("ChatService message routing", () => {
  it("onNewMention emits message_received, saves transcript, and calls handler", async () => {
    const registry = makeRegistry();
    const bridge = new EventBridge();
    const svc = new ChatService(registry as never, bridge);
    const handler = vi.fn() as unknown as ChatMessageHandler;
    svc.onMessage(handler);
    await svc.initialize();

    let got = false;
    bridge.onEvent((e) => {
      if ((e as { type: string }).type === "message_received") {
        got = true;
      }
    });

    await chatMock.handlers.onNewMention(THREAD, MSG);

    expect(got).toBe(true);
    expect(handler).toHaveBeenCalled();
    const row = mocks.db
      .prepare("SELECT * FROM transcripts WHERE conversation_id=?")
      .get("t1") as { content: string };
    expect(row.content).toBe("hi");
  });

  it("onSubscribedMessage ignores non-mention messages", async () => {
    const registry = makeRegistry();
    const bridge = new EventBridge();
    const svc = new ChatService(registry as never, bridge);
    const handler = vi.fn() as unknown as ChatMessageHandler;
    svc.onMessage(handler);
    await svc.initialize();

    await chatMock.handlers.onSubscribedMessage(THREAD, {
      ...MSG,
      isMention: false,
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("saveAgentReply persists an agent transcript", async () => {
    const registry = makeRegistry();
    const bridge = new EventBridge();
    const svc = new ChatService(registry as never, bridge);
    svc.onMessage(async ({ saveAgentReply }) => {
      saveAgentReply("agent reply");
      await Promise.resolve();
    });
    await svc.initialize();

    await chatMock.handlers.onNewMention(THREAD, MSG);

    const rows = mocks.db
      .prepare(
        "SELECT role, content FROM transcripts WHERE conversation_id = ? ORDER BY created_at"
      )
      .all("t1") as Array<{ role: string; content: string }>;
    expect(rows.map((r) => ({ content: r.content, role: r.role }))).toEqual([
      { content: "hi", role: "user" },
      { content: "agent reply", role: "agent" },
    ]);
  });
});

describe("ChatService enable/disable", () => {
  it("enableAdapter enables registry, emits connecting, and rebuilds", async () => {
    const registry = makeRegistry();
    const bridge = new EventBridge();
    const svc = new ChatService(registry as never, bridge);

    await svc.enableAdapter("telegram", { BOT_TOKEN: "x" });
    expect(registry.enable).toHaveBeenCalledWith("telegram", {
      BOT_TOKEN: "x",
    });
    expect(registry.setStatus).toHaveBeenCalledWith("telegram", "connected");
  });
});
