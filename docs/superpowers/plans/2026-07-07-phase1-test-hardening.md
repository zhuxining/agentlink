# Phase 1 测试补强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Phase 1 核心链路（适配器注册、Thread↔Session 映射、ACP 服务、消息路由）补齐最小可行单元测试，把"能联通"变成"能验证"。

**Architecture:** 在 `src/tests/unit/` 下按 `services/<domain>/` 镜像放置测试文件；通过 `vi.mock("@/services/persistence")` 用内存版 `configStore` + `node:sqlite :memory:` 替掉依赖 `electron` 的持久化模块；对 `chat`、`chat/adapters`、`@agentclientprotocol/sdk`、`./acp-transport` 做窄 mock。每个 service 独立成任务，TDD 红→绿→提交。

> **实现偏差（与原计划不同）：** 原计划用 `better-sqlite3 :memory:`，但 vitest worker 的 Node ABI（127）与 `better-sqlite3` 预编译的 bun ABI（148）不匹配，无法加载。改为 Node 内置的 `node:sqlite`（需 Node >= 22.5，已在 `.github/workflows/testing.yaml` 用 `setup-node` 锁定，并在 `package.json` 的 `engines` 标注）。测试环境也从 `jsdom` 改为 `node`（`vitest.config.ts` 的 `environment`），仅 `toggle-theme.test.tsx` 保留 `// @vitest-environment jsdom`。

**Tech Stack:** Vitest + node（默认）/ jsdom（按需）+ @testing-library/jest-dom，node:sqlite（Node 内置，>= 22.5），vi.mock（Vitest 内置）。

## Global Constraints

- 包管理器使用 **bun**；运行测试命令为 `bun run test:unit`（见 AGENTS.md 开发命令）。
- TypeScript 开启 **`noUnusedLocals`、`noUnusedParameters`、`erasableSyntaxOnly`**；禁止 `enum`/`namespace`；测试代码同样受此约束，导入后未使用的符号会编译失败。
- 禁止硬编码密钥；测试中不触碰 `electron.safeStorage`——持久化整体 mock。
- Commit 遵循 **Conventional Commits**：`test(service): add <x> unit tests` 等。
- 每个任务以独立、可测试的产出结束，并单独提交（频繁提交）。
- 不引入新依赖；仅使用已有 `vitest`、`better-sqlite3`、`@testing-library/jest-dom`。
- E2E（Playwright）不在本计划范围（YAGNI，先补单元层）。

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/tests/unit/helpers/persistence-mock.ts` | 新建 | 共享 mock 助手：`createMemoryDatabase()`（建 conversations/transcripts 表的内存库）、`makePersistenceMock(db, state)`（返回 `@/services/persistence` 的 mock 对象） |
| `src/tests/unit/services/chat/adapter-registry.test.ts` | 新建 | 测 `AdapterRegistry`：list/getEnabled/get/enable/disable/setStatus/空 buildAdapterMap |
| `src/tests/unit/services/acp/acp-session-mapper.test.ts` | 新建 | 测 `AcpSessionMapper`：findByThreadId/createMapping/closeSession（真实内存库） |
| `src/tests/unit/services/acp/acp-service.test.ts` | 新建 | 测 `AcpService`：configStore 方法 + connect + sendPrompt（含流式分块） |
| `src/tests/unit/services/chat/chat-service.test.ts` | 新建 | 测 `ChatService`：initialize 状态机 + 消息路由（onNewMention/onSubscribedMessage）+ enable/disable |

> 注：`vitest.config.ts` 的 `test.dir` 为 `./src/tests/unit`，`include` 默认 `**/*.{test,spec}.*`，上述路径会被自动发现。

---

### Task 1: 持久化 Mock 助手

**Files:**
- Create: `src/tests/unit/helpers/persistence-mock.ts`

**Interfaces:**
- Produces: `createMemoryDatabase()`、`makePersistenceMock(db, state)`——后续 4 个测试任务复用。
- 被消费方：每个测试文件顶部的 `vi.hoisted` + `vi.mock("@/services/persistence", () => makePersistenceMock(db, state))`。

- [ ] **Step 1: 写助手模块**

```ts
// src/tests/unit/helpers/persistence-mock.ts
import Database from "better-sqlite3";

export interface MockAcpServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface MockConfigState {
  adapters: Record<string, { env: Record<string, string>; enabled: boolean }>;
  acpServers: MockAcpServer[];
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

export function createMemoryDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.exec(SCHEMA);
  return db;
}

export function makePersistenceMock(db: Database.Database, state: MockConfigState) {
  return {
    getDatabase: () => db,
    createStateAdapter: () => ({}),
    closeDatabase: () => {},
    configStore: {
      get: (key: keyof MockConfigState) => state[key],
      set: (key: keyof MockConfigState, value: unknown) => {
        (state as Record<string, unknown>)[key] = value;
      },
    },
  };
}
```

- [ ] **Step 2: 校验可导入（运行一次空测试确认路径/别名正确）**

Run: `bun run test:unit src/tests/unit/helpers/persistence-mock.ts 2>&1 | tail -5`
Expected: 无导入错误（即便 "No test files found" 也不报错退出）；若报错则说明 `@` 别名在 test 目录解析异常，需确认 `vitest.config.ts` 的 `resolve.alias`。

- [ ] **Step 3: 提交**

```bash
git add src/tests/unit/helpers/persistence-mock.ts
git commit -m "test: add in-memory persistence mock helper for unit tests"
```

---

### Task 2: AdapterRegistry 单元测试

**Files:**
- Create: `src/tests/unit/services/chat/adapter-registry.test.ts`

**Interfaces:**
- Consumes: `makePersistenceMock` / `createMemoryDatabase`（来自 Task 1）；`getAdapter` 来自 `chat/adapters`（需 mock）。
- Produces: 覆盖 `AdapterRegistry` 纯逻辑，后续无需依赖此任务产物。

- [ ] **Step 1: 写失败测试**

```ts
// src/tests/unit/services/chat/adapter-registry.test.ts
import { vi } from "vitest";
import { createMemoryDatabase, makePersistenceMock, type MockConfigState } from "@/tests/unit/helpers/persistence-mock";
import { AdapterRegistry } from "@/services/chat/adapter-registry";

const { db, state } = vi.hoisted(() => ({
  db: createMemoryDatabase(),
  state: { adapters: {}, acpServers: [] } as MockConfigState,
}));

vi.mock("@/services/persistence", () => makePersistenceMock(db, state));
vi.mock("chat/adapters", () => ({
  getAdapter: (slug: string) =>
    ({
      telegram: { name: "Telegram", description: "Telegram adapter", packageName: "@chat-adapter/telegram", factoryExport: "createAdapter" },
      lark: { name: "Lark", description: "Lark adapter", packageName: "@larksuite/vercel-chat-adapter", factoryExport: "createAdapter" },
    })[slug] ?? null,
}));

const registry = () => new AdapterRegistry();

beforeEach(() => {
  state.adapters = {};
});

describe("AdapterRegistry", () => {
  it("list returns supported adapters disabled by default", () => {
    const entries = registry().list();
    expect(entries.map((e) => e.slug).sort()).toEqual(["lark", "telegram"]);
    expect(entries.every((e) => e.enabled === false)).toBe(true);
    expect(entries.every((e) => e.status === "disconnected")).toBe(true);
  });

  it("get returns a single entry by slug", () => {
    expect(registry().get("telegram")?.name).toBe("Telegram");
    expect(registry().get("missing")).toBeUndefined();
  });

  it("enable marks enabled, stores env, sets connecting status", () => {
    const r = registry();
    r.enable("telegram", { BOT_TOKEN: "x" });
    const entry = r.get("telegram")!;
    expect(entry.enabled).toBe(true);
    expect(entry.env).toEqual({ BOT_TOKEN: "x" });
    expect(entry.status).toBe("connecting");
    expect(state.adapters.telegram).toEqual({ env: { BOT_TOKEN: "x" }, enabled: true });
  });

  it("disable clears enabled flag and sets disconnected", () => {
    const r = registry();
    r.enable("telegram", {});
    r.disable("telegram");
    expect(r.get("telegram")!.enabled).toBe(false);
    expect(r.get("telegram")!.status).toBe("disconnected");
  });

  it("getEnabled filters to enabled adapters only", () => {
    const r = registry();
    r.enable("telegram", {});
    expect(r.getEnabled().map((e) => e.slug)).toEqual(["telegram"]);
  });

  it("setStatus updates tracked status and errorMessage", () => {
    const r = registry();
    r.setStatus("telegram", "error", "boom");
    expect(r.get("telegram")!.status).toBe("error");
    expect(r.get("telegram")!.errorMessage).toBe("boom");
  });

  it("buildAdapterMap returns empty when no adapter enabled", async () => {
    const map = await registry().buildAdapterMap();
    expect(map).toEqual({});
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run: `bun run test:unit src/tests/unit/services/chat/adapter-registry.test.ts`
Expected: 7 个用例 PASS（实现已存在，直接绿）。

- [ ] **Step 3: 提交**

```bash
git add src/tests/unit/services/chat/adapter-registry.test.ts
git commit -m "test(service): add AdapterRegistry unit tests"
```

---

### Task 3: AcpSessionMapper 单元测试

**Files:**
- Create: `src/tests/unit/services/acp/acp-session-mapper.test.ts`

**Interfaces:**
- Consumes: `makePersistenceMock` / `createMemoryDatabase`（Task 1）；`getDatabase()` 指向内存库。
- Produces: 无后续依赖。

- [ ] **Step 1: 写失败测试**

```ts
// src/tests/unit/services/acp/acp-session-mapper.test.ts
import { vi } from "vitest";
import { createMemoryDatabase, makePersistenceMock, type MockConfigState } from "@/tests/unit/helpers/persistence-mock";
import { AcpSessionMapper } from "@/services/acp/acp-session-mapper";

const { db, state } = vi.hoisted(() => ({
  db: createMemoryDatabase(),
  state: { adapters: {}, acpServers: [] } as MockConfigState,
}));

vi.mock("@/services/persistence", () => makePersistenceMock(db, state));

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
    m.createMapping({ threadId: "t1", acpServerId: "s1", acpSessionId: "sess1", agentId: "default" });
    m.closeSession("t1");
    expect(m.findByThreadId("t1")).toBeNull();
  });

  it("createMapping persists and findByThreadId returns the record", () => {
    seedConversation("t1");
    const m = new AcpSessionMapper();
    const rec = m.createMapping({ threadId: "t1", acpServerId: "s1", acpSessionId: "sess1", agentId: "a1" });
    expect(rec).toEqual({ threadId: "t1", acpServerId: "s1", acpSessionId: "sess1", agentId: "a1" });
    expect(m.findByThreadId("t1")).toEqual({ threadId: "t1", acpServerId: "s1", acpSessionId: "sess1", agentId: "a1" });
  });

  it("closeSession nulls the session id", () => {
    seedConversation("t1");
    const m = new AcpSessionMapper();
    m.createMapping({ threadId: "t1", acpServerId: "s1", acpSessionId: "sess1", agentId: "a1" });
    m.closeSession("t1");
    const row = db.prepare("SELECT acp_session_id FROM conversations WHERE id=?").get("t1") as { acp_session_id: unknown };
    expect(row.acp_session_id).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run: `bun run test:unit src/tests/unit/services/acp/acp-session-mapper.test.ts`
Expected: 4 个用例 PASS。

- [ ] **Step 3: 提交**

```bash
git add src/tests/unit/services/acp/acp-session-mapper.test.ts
git commit -m "test(service): add AcpSessionMapper unit tests"
```

---

### Task 4: AcpService 单元测试

**Files:**
- Create: `src/tests/unit/services/acp/acp-service.test.ts`

**Interfaces:**
- Consumes: `makePersistenceMock` / `createMemoryDatabase`（Task 1）；mock `@agentclientprotocol/sdk` 的 `client` 与 `@/services/acp/acp-transport` 的 `createStdioStream`。
- Produces: 无后续依赖。

- [ ] **Step 1: 写失败测试（含 ACP SDK 与 transport 的窄 mock）**

```ts
// src/tests/unit/services/acp/acp-service.test.ts
import { vi } from "vitest";
import { createMemoryDatabase, makePersistenceMock, type MockConfigState } from "@/tests/unit/helpers/persistence-mock";
import { AcpService } from "@/services/acp/acp-service";

const { db, state } = vi.hoisted(() => ({
  db: createMemoryDatabase(),
  state: { adapters: {}, acpServers: [] } as MockConfigState,
}));

vi.mock("@/services/persistence", () => makePersistenceMock(db, state));

// 窄 mock：捕获 session/update 通知回调，并暴露 resolvePrompt 供测试控制 prompt 完成
const sdk = vi.hoisted(() => {
  let notifyHandler: ((ctx: { params: { sessionId: string; update: { sessionUpdate: string; content: { type: string; text: string } } } }) => void) | null = null;
  let resolvePrompt: ((v: { stopReason: string }) => void) | null = null;
  const app = {
    onNotification: (_name: string, cb: typeof notifyHandler) => { notifyHandler = cb; },
    onRequest: () => {},
    connectWith: async (_stream: unknown, cb: (ctx: { buildSession: (cwd: string) => { start: () => Promise<{ sessionId: string; prompt: (p: string) => Promise<{ stopReason: string }>; dispose: () => void }> }) => void) => Promise<void>) => {
      const ctx = {
        buildSession: () => ({
          start: async () => ({
            sessionId: "sess_1",
            prompt: () => new Promise((res) => { resolvePrompt = res; }),
            dispose: () => {},
          }),
        }),
      };
      await cb(ctx);
    },
  };
  return { app, getNotify: () => notifyHandler, resolvePrompt: (v: { stopReason: string }) => resolvePrompt?.(v) };
});

vi.mock("@agentclientprotocol/sdk", () => ({ client: () => sdk.app }));
vi.mock("@/services/acp/acp-transport", () => ({
  createStdioStream: () => ({ stream: {}, process: { on: () => {}, kill: () => {} } }),
}));

const SERVER = { id: "pi", name: "Pi", command: "npx", args: ["pi-acp"] };

beforeEach(() => {
  state.acpServers = [];
  db.exec("DELETE FROM conversations");
});

describe("AcpService config", () => {
  it("addServer then getServers returns it", () => {
    const s = new AcpService();
    s.addServer(SERVER);
    expect(s.getServers().map((x) => x.id)).toContain("pi");
  });

  it("addServer throws on duplicate id", () => {
    const s = new AcpService();
    s.addServer(SERVER);
    expect(() => s.addServer(SERVER)).toThrow(/exists/);
  });

  it("removeServer removes the entry", () => {
    const s = new AcpService();
    s.addServer(SERVER);
    s.removeServer("pi");
    expect(s.getServers().map((x) => x.id)).not.toContain("pi");
  });

  it("getServerStatus defaults to disconnected", () => {
    expect(new AcpService().getServerStatus("pi")).toBe("disconnected");
  });
});

describe("AcpService connect/sendPrompt", () => {
  it("connect throws when server not found", async () => {
    await expect(new AcpService().connect("nope")).rejects.toThrow(/not found/);
  });

  it("connect succeeds and flips status to connected", async () => {
    const s = new AcpService();
    s.addServer(SERVER);
    await s.connect("pi");
    expect(s.getServerStatus("pi")).toBe("connected");
    s.disconnect("pi");
    expect(s.getServerStatus("pi")).toBe("disconnected");
  });

  it("sendPrompt throws when server not connected", async () => {
    await expect(new AcpService().sendPrompt({ serverId: "pi", threadId: "t1", prompt: "hi" })).rejects.toThrow(/not connected/);
  });

  it("sendPrompt returns sessionId/stopReason and streams chunks to handler", async () => {
    db.prepare("INSERT INTO conversations (id, adapter, title, created_at, updated_at) VALUES (?,?,?,?,?)").run("t1", "telegram", "", Date.now(), Date.now());
    const s = new AcpService();
    s.addServer(SERVER);
    const onChunk = vi.fn();
    s.setChunkHandler(onChunk);
    await s.connect("pi");

    const p = s.sendPrompt({ serverId: "pi", threadId: "t1", prompt: "hi" });
    sdk.getNotify()?.({ params: { sessionId: "sess_1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "chunk!" } } } });
    sdk.resolvePrompt({ stopReason: "end_turn" });
    const res = await p;

    expect(res).toEqual({ sessionId: "sess_1", stopReason: "end_turn" });
    expect(onChunk).toHaveBeenCalledWith("t1", "chunk!");
    s.disconnect("pi");
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run: `bun run test:unit src/tests/unit/services/acp/acp-service.test.ts`
Expected: 8 个用例 PASS。若 `connect` 超时，检查 `client` mock 的 `connectWith` 是否调用了回调（cb）并触发 `onReady`；若 `sendPrompt` 卡住，确认 `resolvePrompt` 在测试中被调用。

- [ ] **Step 3: 提交**

```bash
git add src/tests/unit/services/acp/acp-service.test.ts
git commit -m "test(service): add AcpService unit tests (config, connect, sendPrompt)"
```

---

### Task 5: ChatService 单元测试

**Files:**
- Create: `src/tests/unit/services/chat/chat-service.test.ts`

**Interfaces:**
- Consumes: `makePersistenceMock` / `createMemoryDatabase`（Task 1）；mock `chat` 的 `Chat` 类；用 stub `registry`（无需真实 `AdapterRegistry`）。
- Produces: 无后续依赖。

- [ ] **Step 1: 写失败测试**

```ts
// src/tests/unit/services/chat/chat-service.test.ts
import { vi } from "vitest";
import { createMemoryDatabase, makePersistenceMock, type MockConfigState } from "@/tests/unit/helpers/persistence-mock";
import { ChatService, type ChatMessageHandler } from "@/services/chat/chat-service";
import { EventBridge } from "@/services/chat/event-bridge";

const { db, state } = vi.hoisted(() => ({
  db: createMemoryDatabase(),
  state: { adapters: {}, acpServers: [] } as MockConfigState,
}));

vi.mock("@/services/persistence", () => makePersistenceMock(db, state));

// 捕获 Chat SDK 事件回调的窄 mock
const chatMock = vi.hoisted(() => {
  const handlers: Record<string, (thread: unknown, message: unknown) => Promise<void>> = {};
  const fakeChat = {
    onNewMention: (cb: (t: unknown, m: unknown) => Promise<void>) => { handlers.onNewMention = cb; },
    onDirectMessage: (cb: (t: unknown, m: unknown) => Promise<void>) => { handlers.onDirectMessage = cb; },
    onSubscribedMessage: (cb: (t: unknown, m: unknown) => Promise<void>) => { handlers.onSubscribedMessage = cb; },
    initialize: vi.fn(async () => {}),
    shutdown: vi.fn(async () => {}),
  };
  return { handlers, fakeChat };
});

vi.mock("chat", () => ({
  Chat: class {
    constructor() {
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

const THREAD = { id: "t1", channel: { name: "telegram" }, post: vi.fn(async () => {}), subscribe: vi.fn(async () => {}) };
const MSG = { text: "hi", author: { fullName: "Bob" }, isMention: true };

beforeEach(() => {
  db.exec("DELETE FROM conversations");
  db.exec("DELETE FROM transcripts");
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
    expect(events.some((e) => (e as { type: string }).type === "adapter_status_changed" && (e as { status: string }).status === "connected")).toBe(true);
  });
});

describe("ChatService message routing", () => {
  it("onNewMention emits message_received, saves transcript, and calls handler", async () => {
    const registry = makeRegistry();
    const bridge = new EventBridge();
    const svc = new ChatService(registry as never, bridge);
    const handler = vi.fn() as unknown as ChatMessageHandler;
    svc.onMessage(handler);

    let got = false;
    bridge.onEvent((e) => { if ((e as { type: string }).type === "message_received") got = true; });

    await chatMock.handlers.onNewMention(THREAD, MSG);

    expect(got).toBe(true);
    expect(handler).toHaveBeenCalled();
    const row = db.prepare("SELECT * FROM transcripts WHERE conversation_id=?").get("t1") as { content: string };
    expect(row.content).toBe("hi");
  });

  it("onSubscribedMessage ignores non-mention messages", async () => {
    const registry = makeRegistry();
    const bridge = new EventBridge();
    const svc = new ChatService(registry as never, bridge);
    const handler = vi.fn() as unknown as ChatMessageHandler;
    svc.onMessage(handler);

    await chatMock.handlers.onSubscribedMessage(THREAD, { ...MSG, isMention: false });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("ChatService enable/disable", () => {
  it("enableAdapter enables registry, emits connecting, and rebuilds", async () => {
    const registry = makeRegistry();
    const bridge = new EventBridge();
    const svc = new ChatService(registry as never, bridge);

    await svc.enableAdapter("telegram", { BOT_TOKEN: "x" });
    expect(registry.enable).toHaveBeenCalledWith("telegram", { BOT_TOKEN: "x" });
    expect(registry.setStatus).toHaveBeenCalledWith("telegram", "connected");
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run: `bun run test:unit src/tests/unit/services/chat/chat-service.test.ts`
Expected: 4 个用例 PASS。若 `initialize` 未触发 `connected`，确认 `buildAdapterMap` 返回非空且 `registerHandlers` 已注册（mock 的 `Chat` 构造返回 `fakeChat`）。

- [ ] **Step 3: 提交**

```bash
git add src/tests/unit/services/chat/chat-service.test.ts
git commit -m "test(service): add ChatService unit tests (init + routing)"
```

---

### Task 6: 全量单测回归

**Files:**
- 无新增，仅运行。

- [ ] **Step 1: 运行全量单元测试**

Run: `bun run test:unit`
Expected: 所有用例 PASS（adapter-registry 7 + session-mapper 4 + acp-service 8 + chat-service 4 = 23，另含 1 个既有 toggle-theme 测试），无 TypeScript 编译错误（`noUnusedLocals` 等）。

- [ ] **Step 2: 运行项目既有检查，确保不引入回归**

Run: `bun run check`
Expected: Ultracite 无报错（mock 文件若触发 lint，按需用 `// biome-ignore` 或调整）。

- [ ] **Step 3: 提交（若 Step 2 有修正）**

仅在 Step 2 产生改动时提交：
```bash
git add -A
git commit -m "test: run full unit suite for Phase 1 core path"
```
若无改动则跳过提交。
