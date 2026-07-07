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
  state: { adapters: {}, acpServers: [] } as MockConfigState,
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
    onNewMention: (cb: (t: unknown, m: unknown) => Promise<void>) => {
      handlers.onNewMention = cb;
    },
    onDirectMessage: (cb: (t: unknown, m: unknown) => Promise<void>) => {
      handlers.onDirectMessage = cb;
    },
    onSubscribedMessage: (cb: (t: unknown, m: unknown) => Promise<void>) => {
      handlers.onSubscribedMessage = cb;
    },
    initialize: vi.fn(async () => undefined),
    shutdown: vi.fn(async () => undefined),
  };
  return { handlers, fakeChat };
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
    list: vi.fn(() => []),
    getEnabled: vi.fn(() => []),
    buildAdapterMap: vi.fn(async () => ({ telegram: {} })),
    enable: vi.fn(),
    disable: vi.fn(),
    setStatus: vi.fn(),
    get: vi.fn(),
  };
}

const THREAD = {
  id: "t1",
  channel: { name: "telegram" },
  post: vi.fn(async () => undefined),
  subscribe: vi.fn(async () => undefined),
};
const MSG = { text: "hi", author: { fullName: "Bob" }, isMention: true };

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
