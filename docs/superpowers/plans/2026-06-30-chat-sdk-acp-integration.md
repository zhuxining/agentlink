# Chat SDK + ACP 集成 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通飞书/Telegram → Chat SDK → ACP Agent → 流式返回 IM 的端到端闭环

**Architecture:** 在主进程中重构 services/ 为 chat/acp/persistence 三层，通过 @orpc/server MessagePort IPC 与渲染进程通信。Chat SDK 事件直接驱动消息处理，ACP SDK 通过 stdio transport 连接 Agent 子进程

**Tech Stack:** Electron 42.x, React 19.x, TypeScript 6.x, Chat SDK 4.31.x, @agentclientprotocol/sdk 1.x, @orpc/server 1.x, @tanstack/react-query 5.x, SQLite, electron-store

## Global Constraints

- 所有凭据使用 electron-store（safeStorage 加密）
- Chat SDK 事件即消息入口，不引入独立 MessageBus 层
- 使用 ACP SDK `client()` 新 API（非弃用的 `ClientSideConnection`）
- IPC 遵循现有 `os.handler().input(schema)` 模式
- 渲染进程通过 actions/ 层调用 IPC，不直接触及 `ipc.client`
- Phase 1 范围: persistence + chat + acp 服务层 + channel/acp/conversation/events IPC + 渠道/对话/设置 UI

---

### Task 1: 安装依赖 + persistence 基础层

**Files:**
- Modify: `package.json`
- Create: `src/services/persistence/config-store.ts`
- Create: `src/services/persistence/database.ts`
- Create: `src/services/persistence/state-adapter.ts`
- Create: `src/services/persistence/index.ts`

**Produces:**
- `configStore` — electron-store 实例（凭据持久化）
- `getDatabase()` → SQLite Database（自动建表）
- `createStateAdapter()` → Chat SDK State 实例

- [ ] **Step 1: 安装 electron-store**

```bash
cd /Users/zhuxining/Code/agentlink/.worktrees/feat+chat-sdk-integration
bun add electron-store
```

- [ ] **Step 2: 创建 src/services/persistence/config-store.ts**

```typescript
import Store from "electron-store";

interface AdapterCredentials {
  [slug: string]: { env: Record<string, string>; enabled: boolean };
}

interface AcpServerEntry {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface ConfigSchema {
  adapters: AdapterCredentials;
  acpServers: AcpServerEntry[];
}

export const configStore = new Store<ConfigSchema>({
  name: "agentlink-config",
  defaults: { adapters: {}, acpServers: [] },
});

export type { AcpServerEntry, AdapterCredentials, ConfigSchema };
```

- [ ] **Step 3: 创建 src/services/persistence/database.ts**

```typescript
import Database from "better-sqlite3";
import path from "node:path";
import { app } from "electron";

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db) return db;
  const dbPath = path.join(app.getPath("userData"), "agentlink.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
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
  if (db) { db.close(); db = null; }
}
```

- [ ] **Step 4: 创建 src/services/persistence/state-adapter.ts**

```typescript
import { createMemoryState } from "@chat-adapter/state-memory";
import type { State } from "chat";

let state: State | null = null;

export function createStateAdapter(): State {
  if (!state) state = createMemoryState();
  return state;
}
```

- [ ] **Step 5: 创建 src/services/persistence/index.ts**

```typescript
export { configStore } from "./config-store";
export type { AcpServerEntry, AdapterCredentials, ConfigSchema } from "./config-store";
export { closeDatabase, getDatabase } from "./database";
export { createStateAdapter } from "./state-adapter";
```

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/services/persistence/
git commit -m "feat(persistence): add config-store, SQLite database, and state adapter"
```

---

### Task 2: AdapterRegistry + EventBridge

**Files:**
- Create: `src/services/chat/adapter-registry.ts`
- Create: `src/services/chat/event-bridge.ts`
- Create: `src/services/chat/index.ts`

**Produces:**
- `class AdapterRegistry` — list(), getEnabled(), enable(slug, env), disable(slug), buildAdapterMap()
- `class EventBridge` — emit(event), onEvent(handler): unsubscribe
- `type AppEvent` — message_received | message_sent | adapter_status_changed | acp_session_update | acp_server_status_changed | agent_error

- [ ] **Step 1: 创建 src/services/chat/adapter-registry.ts**

```typescript
import type { Adapter } from "chat";
import { getAdapter } from "chat/adapters";
import { configStore } from "@/services/persistence";

const SUPPORTED = ["telegram", "lark"] as const;
const PKG_OVERRIDE: Record<string, string> = { lark: "@larksuite/vercel-chat-adapter" };

function resolvePkg(slug: string): string {
  return PKG_OVERRIDE[slug] ?? getAdapter(slug)?.packageName ?? "";
}

export interface AdapterEntry {
  slug: string;
  name: string;
  description: string;
  enabled: boolean;
  env: Record<string, string>;
  status: "disconnected" | "connecting" | "connected" | "error";
  errorMessage?: string;
}

export class AdapterRegistry {
  list(): AdapterEntry[] {
    const creds = configStore.get("adapters", {});
    return SUPPORTED.map((slug) => {
      const meta = getAdapter(slug);
      if (!meta) return null;
      const saved = creds[slug];
      return {
        slug, name: meta.name, description: meta.description,
        enabled: saved?.enabled ?? false, env: saved?.env ?? {},
        status: "disconnected" as const,
      };
    }).filter(Boolean) as AdapterEntry[];
  }

  getEnabled(): AdapterEntry[] { return this.list().filter((a) => a.enabled); }

  get(slug: string): AdapterEntry | undefined { return this.list().find((a) => a.slug === slug); }

  async enable(slug: string, env: Record<string, string>): Promise<void> {
    const creds = configStore.get("adapters", {});
    creds[slug] = { env, enabled: true };
    configStore.set("adapters", creds);
  }

  async disable(slug: string): Promise<void> {
    const creds = configStore.get("adapters", {});
    if (creds[slug]) { creds[slug].enabled = false; configStore.set("adapters", creds); }
  }

  buildAdapterMap(): Record<string, Adapter> {
    const map: Record<string, Adapter> = {};
    const creds = configStore.get("adapters", {});
    for (const slug of SUPPORTED) {
      const saved = creds[slug];
      if (!saved?.enabled) continue;
      const prev: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(saved.env)) { prev[k] = process.env[k]; process.env[k] = v; }
      try {
        const pkg = resolvePkg(slug);
        const mod = require(pkg) as Record<string, unknown>;
        const meta = getAdapter(slug);
        const factory = mod[meta?.factoryExport ?? "createAdapter"] as (cfg?: Record<string, unknown>) => Adapter;
        map[slug] = factory({});
      } finally {
        for (const [k, p] of Object.entries(prev)) {
          if (p === undefined) delete process.env[k]; else process.env[k] = p;
        }
      }
    }
    return map;
  }
}
```

- [ ] **Step 2: 创建 src/services/chat/event-bridge.ts**

```typescript
import type { AdapterEntry } from "./adapter-registry";

export type AppEvent =
  | { type: "message_received"; threadId: string; adapter: string; message: { text: string; authorName: string; channelName: string | null; isMention: boolean } }
  | { type: "message_sent"; threadId: string; adapter: string; text: string }
  | { type: "adapter_status_changed"; adapter: string; status: AdapterEntry["status"]; error?: string }
  | { type: "acp_session_update"; sessionId: string; threadId: string; text: string }
  | { type: "acp_server_status_changed"; serverId: string; status: "connecting" | "connected" | "disconnected" | "error"; error?: string }
  | { type: "agent_error"; threadId: string; adapter: string; error: string };

type Handler = (event: AppEvent) => void;

export class EventBridge {
  private handlers = new Set<Handler>();
  emit(event: AppEvent): void { for (const h of this.handlers) { try { h(event); } catch (e) { console.error("[EventBridge]", e); } } }
  onEvent(handler: Handler): () => void { this.handlers.add(handler); return () => { this.handlers.delete(handler); }; }
}
```

- [ ] **Step 3: 创建 src/services/chat/index.ts**

```typescript
export { AdapterRegistry } from "./adapter-registry";
export type { AdapterEntry } from "./adapter-registry";
export { ChatService } from "./chat-service";
export { EventBridge } from "./event-bridge";
export type { AppEvent } from "./event-bridge";
```

- [ ] **Step 4: Commit**

```bash
git add src/services/chat/
git commit -m "feat(chat): add AdapterRegistry and EventBridge"
```

---

### Task 3: ChatService — Chat SDK 生命周期 + 消息事件处理

**Files:**
- Create: `src/services/chat/chat-service.ts`

**Produces:**
- `class ChatService` — initialize(), shutdown(), rebuild(), enableAdapter(slug, env), disableAdapter(slug), onMessage(handler)
- 事件注册：onNewMention, onDirectMessage, onSubscribedMessage
- 消息通过 `onMessage` 回调外传给上层（上层负责调用 ACP）
- transcript 自动写入 SQLite

- [ ] **Step 1: 创建 src/services/chat/chat-service.ts**

```typescript
import { Chat } from "chat";
import type { Adapter } from "chat";
import { createStateAdapter, getDatabase } from "@/services/persistence";
import type { AdapterEntry, AdapterRegistry } from "./adapter-registry";
import type { EventBridge } from "./event-bridge";

export type ChatMessageHandler = (ctx: {
  thread: { id: string; channel: { name: string }; post: (content: unknown) => Promise<unknown>; stream: (content: unknown) => Promise<unknown>; subscribe: () => Promise<void> };
  message: { text: string; author: { fullName: string }; isMention: boolean };
}) => Promise<void>;

export class ChatService {
  private chat: Chat | null = null;
  private handler: ChatMessageHandler | null = null;

  constructor(
    private registry: AdapterRegistry,
    private eventBridge: EventBridge,
  ) {}

  onMessage(handler: ChatMessageHandler): void { this.handler = handler; }

  getChat(): Chat | null { return this.chat; }
  getAdapters(): AdapterEntry[] { return this.registry.list(); }
  getEnabledAdapters(): AdapterEntry[] { return this.registry.getEnabled(); }

  async enableAdapter(slug: string, env: Record<string, string>): Promise<void> {
    await this.registry.enable(slug, env);
    this.eventBridge.emit({ type: "adapter_status_changed", adapter: slug, status: "connecting" });
    await this.rebuild();
  }

  async disableAdapter(slug: string): Promise<void> {
    await this.registry.disable(slug);
    this.eventBridge.emit({ type: "adapter_status_changed", adapter: slug, status: "disconnected" });
    await this.rebuild();
  }

  async initialize(): Promise<void> {
    const adapters = this.registry.buildAdapterMap();
    if (Object.keys(adapters).length === 0) { console.log("[ChatService] No adapters enabled"); return; }
    this.chat = new Chat({ adapters, state: createStateAdapter(), userName: "AgentLink" });
    this.registerHandlers();
    await this.chat.initialize();
    console.log("[ChatService] Initialized");
    for (const a of this.registry.getEnabled()) {
      this.eventBridge.emit({ type: "adapter_status_changed", adapter: a.slug, status: "connected" });
    }
  }

  async shutdown(): Promise<void> {
    if (this.chat) { await this.chat.shutdown(); this.chat = null; }
  }

  private async rebuild(): Promise<void> { await this.shutdown(); await this.initialize(); }

  private registerHandlers(): void {
    const chat = this.chat;
    if (!chat) return;

    const processMessage = async (
      thread: { id: string; channel: { name: string }; post: (c: unknown) => Promise<unknown>; stream: (c: unknown) => Promise<unknown>; subscribe: () => Promise<void> },
      message: { text: string; author: { fullName: string }; isMention: boolean },
    ) => {
      const adapter = thread.channel.name ?? "unknown";
      this.eventBridge.emit({ type: "message_received", threadId: thread.id, adapter, message: { text: message.text, authorName: message.author.fullName, channelName: thread.channel.name, isMention: message.isMention } });
      this.saveTranscript(thread.id, adapter, "user", message.text);
      if (this.handler) {
        try { await this.handler({ thread, message }); } catch (err) {
          console.error("[ChatService] Handler error:", err);
          this.eventBridge.emit({ type: "agent_error", threadId: thread.id, adapter, error: err instanceof Error ? err.message : String(err) });
        }
      }
    };

    chat.onNewMention(async (thread, message) => { await processMessage(thread, message); });
    chat.onDirectMessage(async (thread, message) => { await processMessage(thread, message); });
    chat.onSubscribedMessage((thread, message) => { if (message.isMention) { processMessage(thread, message); } });
  }

  private saveTranscript(convId: string, adapter: string, role: "user" | "agent", content: string): void {
    try {
      const db = getDatabase();
      db.prepare(`INSERT INTO conversations (id, adapter, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`).run(convId, adapter, "", Date.now(), Date.now());
      db.prepare(`INSERT INTO transcripts (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)`).run(convId, role, content, Date.now());
    } catch (e) { console.error("[ChatService] Transcript save error:", e); }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/chat/chat-service.ts
git commit -m "feat(chat): add ChatService with SDK lifecycle and message routing"
```

---

### Task 4: ACP Transport + SessionMapper + AcpService

**Files:**
- Create: `src/services/acp/acp-transport.ts`
- Create: `src/services/acp/acp-session-mapper.ts`
- Create: `src/services/acp/acp-service.ts`
- Create: `src/services/acp/index.ts`

**Produces:**
- `createStdioStream(command, args, env?)` → `{ stream: Stream; process: ChildProcess }`
- `class AcpSessionMapper` — findByThreadId(), createMapping(), closeSession()
- `class AcpService` — addServer(), removeServer(), connect(id), disconnect(id), getServers(), sendPrompt({serverId, threadId, prompt, onChunk})

- [ ] **Step 1: 创建 src/services/acp/acp-transport.ts**

```typescript
import { spawn, type ChildProcess } from "node:child_process";
import { ndJsonStream } from "@agentclientprotocol/sdk";
import type { Stream } from "@agentclientprotocol/sdk";

export interface AcpTransport { stream: Stream; process: ChildProcess; }

export function createStdioStream(command: string, args: string[], env?: Record<string, string>): Promise<AcpTransport> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ...env } });
    child.on("error", (err) => reject(new Error(`Failed to spawn ACP server: ${err.message}`)));
    const timeout = setTimeout(() => {
      if (child.exitCode !== null) { reject(new Error(`ACP server exited with code ${child.exitCode}`)); return; }
      const writable = new WritableStream<Uint8Array>({ write(chunk) { child.stdin.write(chunk); }, close() { child.stdin.end(); } });
      const readable = new ReadableStream<Uint8Array>({
        start(ctrl) { child.stdout!.on("data", (c: Buffer) => ctrl.enqueue(new Uint8Array(c))); child.stdout!.on("end", () => ctrl.close()); child.stdout!.on("error", (e) => ctrl.error(e)); },
        cancel() { child.stdout!.destroy(); },
      });
      resolve({ stream: ndJsonStream(writable, readable), process: child });
    }, 500);
  });
}
```

- [ ] **Step 2: 创建 src/services/acp/acp-session-mapper.ts**

```typescript
import { getDatabase } from "@/services/persistence";

export interface AcpSessionRecord { threadId: string; acpServerId: string; acpSessionId: string; agentId: string; }

export class AcpSessionMapper {
  findByThreadId(threadId: string): AcpSessionRecord | null {
    const row = getDatabase().prepare(`SELECT acp_server_id, acp_session_id, agent_id FROM conversations WHERE id = ? AND acp_session_id IS NOT NULL`).get(threadId) as { acp_server_id: string; acp_session_id: string; agent_id: string } | undefined;
    return row ? { threadId, acpServerId: row.acp_server_id, acpSessionId: row.acp_session_id, agentId: row.agent_id } : null;
  }
  createMapping(p: { threadId: string; acpServerId: string; acpSessionId: string; agentId: string }): AcpSessionRecord {
    getDatabase().prepare(`UPDATE conversations SET acp_server_id=?, acp_session_id=?, agent_id=?, updated_at=? WHERE id=?`).run(p.acpServerId, p.acpSessionId, p.agentId, Date.now(), p.threadId);
    return { threadId: p.threadId, acpServerId: p.acpServerId, acpSessionId: p.acpSessionId, agentId: p.agentId };
  }
  closeSession(threadId: string): void {
    getDatabase().prepare(`UPDATE conversations SET acp_session_id=NULL, updated_at=? WHERE id=?`).run(Date.now(), threadId);
  }
}
```

- [ ] **Step 3: 创建 src/services/acp/acp-service.ts**

ACP SDK 的 `client()` API 通过 `connectWith` 提供上下文。连接建立后保持活跃直到回调返回。我们用 `onNotification("session/update")` 接收流式文本块，用 `session.prompt()` 发送消息并等待完成。

```typescript
import { client } from "@agentclientprotocol/sdk";
import type { ClientContext } from "@agentclientprotocol/sdk";
import type { ChildProcess } from "node:child_process";
import { configStore } from "@/services/persistence";
import type { AcpServerEntry } from "@/services/persistence";
import { AcpSessionMapper } from "./acp-session-mapper";
import { createStdioStream } from "./acp-transport";

export type { AcpServerEntry as AcpServerConfig };

interface ActiveConnection { process: ChildProcess; shutdown: () => void; }

// 将 ACP sessionId 映射回 Chat SDK threadId
const sessionToThread = new Map<string, string>();

export class AcpService {
  private connections = new Map<string, ActiveConnection>();
  private contexts = new Map<string, ClientContext>();
  private sessionMapper = new AcpSessionMapper();
  private onChunk: ((threadId: string, text: string) => void) | null = null;

  setChunkHandler(handler: (threadId: string, text: string) => void): void { this.onChunk = handler; }

  getServers(): AcpServerEntry[] { return configStore.get("acpServers", []); }

  addServer(config: AcpServerEntry): void {
    const servers = this.getServers();
    if (servers.find((s) => s.id === config.id)) throw new Error(`Server "${config.id}" exists`);
    servers.push(config);
    configStore.set("acpServers", servers);
  }

  removeServer(id: string): void {
    configStore.set("acpServers", this.getServers().filter((s) => s.id !== id));
    this.disconnect(id);
  }

  getServerStatus(id: string): "disconnected" | "connecting" | "connected" | "error" {
    return this.connections.has(id) ? "connected" : "disconnected";
  }

  async connect(id: string): Promise<void> {
    const server = this.getServers().find((s) => s.id === id);
    if (!server) throw new Error(`Server "${id}" not found`);
    if (this.connections.has(id)) return;

    const { stream, process } = await createStdioStream(server.command, server.args, server.env);
    const app = client({ name: "AgentLink" });

    let shutdownResolve: () => void;
    const shutdownPromise = new Promise<void>((r) => { shutdownResolve = r; });

    // 注册 session/update 通知处理 — 提取 agent_message_chunk 并流式转发
    app.onNotification("session/update", (notification: { sessionId: string; update: Record<string, unknown> }) => {
      const threadId = sessionToThread.get(notification.sessionId);
      if (!threadId || !this.onChunk) return;
      const update = notification.update;
      if (update && typeof update === "object" && "agent_message_chunk" in update) {
        this.onChunk(threadId, (update as { agent_message_chunk: { text: string } }).agent_message_chunk.text);
      }
    });

    // Phase 1: 自动批准所有权限请求
    app.onRequest("session/request_permission", async () => ({
      outcome: "selected" as const,
      decision: "allow_once" as const,
    }));

    // connectWith 在回调运行期间保持连接（回调中的 await shutdownPromise 阻塞直到 shutdown 被调用）
    app.connectWith(stream, async (ctx) => {
      // ctx 已由 SDK 自动完成 initialize 握手，直接可用
      this.contexts.set(id, ctx);
      await shutdownPromise;
    });

    process.on("exit", (code) => {
      console.log(`[AcpService] Server "${id}" exited (${code})`);
      this.contexts.delete(id);
      this.connections.delete(id);
    });

    this.connections.set(id, { process, shutdown: shutdownResolve! });

    console.log(`[AcpService] Connected to "${id}"`);
  }

  disconnect(id: string): void {
    const conn = this.connections.get(id);
    if (conn) { conn.shutdown(); conn.process.kill(); }
    this.connections.delete(id);
    this.contexts.delete(id);
  }

  async sendPrompt(params: {
    serverId: string;
    threadId: string;
    prompt: string;
  }): Promise<{ sessionId: string; stopReason: string }> {
    const ctx = this.contexts.get(params.serverId);
    if (!ctx) throw new Error(`Server "${params.serverId}" not connected`);

    const existing = this.sessionMapper.findByThreadId(params.threadId);
    const cwd = process.cwd();
    let sessionId: string;
    let session: Awaited<ReturnType<ClientContext["buildSession"]>> extends infer B
      ? B extends { start(): infer S } ? S : never
      : never;

    if (existing) {
      // 复用已有 ACP Session (通过 session/load)
      sessionId = existing.acpSessionId;
      // 创建新 builder 但使用已有 sessionId — 实际中通过 resume 或者继续用同一个 session
      // Phase 1 简化: 总是新建 session
      const s = await ctx.buildSession(cwd).start();
      session = s;
      sessionId = s.sessionId;
    } else {
      const s = await ctx.buildSession(cwd).start();
      session = s;
      sessionId = s.sessionId;
      this.sessionMapper.createMapping({
        threadId: params.threadId,
        acpServerId: params.serverId,
        acpSessionId: sessionId,
        agentId: "default",
      });
    }

    // 建立 sessionId → threadId 映射（供 onNotification 回调查找）
    sessionToThread.set(sessionId, params.threadId);

    // 发送 prompt — 这是一个阻塞调用，等待 agent 完成整个 turn
    // 流式文本块通过 onNotification("session/update") 异步推送
    const response = await session.prompt(params.prompt);

    // 清理映射
    sessionToThread.delete(sessionId);

    // 保存 agent 响应到 transcript
    const { getDatabase } = await import("@/services/persistence/database");
    getDatabase().prepare(
      `INSERT INTO transcripts (conversation_id, role, content, created_at) VALUES (?, 'agent', ?, ?)`
    ).run(params.threadId, `[response: ${response.stopReason}]`, Date.now());

    return { sessionId, stopReason: response.stopReason };
  }

  disconnectAll(): void {
    for (const [id] of this.connections) this.disconnect(id);
  }
}
```

- [ ] **Step 4: 创建 src/services/acp/index.ts**

```typescript
export { AcpService } from "./acp-service";
export type { AcpServerConfig } from "./acp-service";
export { AcpSessionMapper } from "./acp-session-mapper";
export type { AcpSessionRecord } from "./acp-session-mapper";
export { createStdioStream } from "./acp-transport";
export type { AcpTransport } from "./acp-transport";
```

- [ ] **Step 5: Commit**

```bash
git add src/services/acp/
git commit -m "feat(acp): add ACP transport, session mapper, and AcpService"
```

---

### Task 5: 组装主进程 — 连接 ChatService 和 AcpService

**Files:**
- Create: `src/services/bootstrap.ts`
- Modify: `src/main.ts`（整合新服务层启动流程）

**Interface:**
- `bootstrapServices()` → `{ chatService, acpService, eventBridge }` — 创建所有 service 实例并连接它们

- [ ] **Step 1: 创建 src/services/bootstrap.ts**

```typescript
import { AdapterRegistry, ChatService, EventBridge } from "./chat";
import { AcpService } from "./acp";

export interface AppServices {
  chatService: ChatService;
  acpService: AcpService;
  eventBridge: EventBridge;
}

export async function bootstrapServices(): Promise<AppServices> {
  const eventBridge = new EventBridge();
  const registry = new AdapterRegistry();
  const chatService = new ChatService(registry, eventBridge);
  const acpService = new AcpService();

  // 连接 ChatService → AcpService：收到 IM 消息后发送给 ACP
  acpService.setChunkHandler(async (threadId: string, text: string) => {
    // 此回调在 AcpService 收到 agent_message_chunk 时触发
    eventBridge.emit({ type: "acp_session_update", sessionId: "", threadId, text });
  });

  chatService.onMessage(async ({ thread, message }) => {
    // Phase 1: 使用第一个配置的 ACP Server
    const servers = acpService.getServers();
    if (servers.length === 0) {
      await thread.post("未配置 ACP Server，请在设置中添加。");
      return;
    }
    const serverId = servers[0].id;
    await acpService.sendPrompt({ serverId, threadId: thread.id, prompt: message.text });

    // sendPrompt 返回时，消息已通过 onChunk 流式发送完毕
    // 但我们需要把响应也发回 IM
    // sendPrompt 是阻塞的（等待整个 turn 完成），onChunk 中已经流式发送了每个 chunk
    // 这里不需要额外 post
  });

  // 初始化 ChatService（启动已启用的适配器）
  await chatService.initialize();

  // 自动连接已配置的 ACP Server
  for (const server of acpService.getServers()) {
    try {
      await acpService.connect(server.id);
    } catch (err) {
      console.error(`[bootstrap] Failed to connect ACP server "${server.id}":`, err);
    }
  }

  return { chatService, acpService, eventBridge };
}
```

- [ ] **Step 2: 修改 src/main.ts 启动流程**

Replace the old Chat SDK initialization with the new bootstrap:

```typescript
// 替换 src/main.ts 中 app.whenReady() 内的启动逻辑:
// 删除:
//   const { getChat, registerMessageHandlers } = await import("./services/channel");
//   getChat();
//   registerMessageHandlers();
//
// 替换为:
//   const { bootstrapServices } = await import("./services/bootstrap");
//   const services = await bootstrapServices();
//   // 挂载到全局以便 IPC 处理器访问
//   (globalThis as Record<string, unknown>).__services = services;

app.whenReady().then(async () => {
  try {
    createWindow();
    await installExtensions();
    checkForUpdates();
    await setupORPC();

    const { bootstrapServices } = await import("./services/bootstrap");
    const services = await bootstrapServices();
    (globalThis as Record<string, unknown>).__services = services;
  } catch (error) {
    console.error("Error during app initialization:", error);
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add src/services/bootstrap.ts src/main.ts
git commit -m "feat(core): wire ChatService and AcpService in main process bootstrap"
```

---

### Task 6: 重写 IPC 层 — channel + acp + conversation + events

**Files:**
- Create: `src/ipc/channel/index.ts`, `src/ipc/channel/handlers.ts`, `src/ipc/channel/schemas.ts`
- Create: `src/ipc/acp/index.ts`, `src/ipc/acp/handlers.ts`, `src/ipc/acp/schemas.ts`
- Create: `src/ipc/conversation/index.ts`, `src/ipc/conversation/handlers.ts`, `src/ipc/conversation/schemas.ts`
- Create: `src/ipc/events/index.ts`, `src/ipc/events/handlers.ts`, `src/ipc/events/schemas.ts`, `src/ipc/events/event-types.ts`
- Modify: `src/ipc/router.ts`（添加新域）

**Pattern:** 每个域遵循 `theme/` 的模式：`os.handler().input(zodSchema).handler(fn)`，在 `index.ts` 中导出对象

- [ ] **Step 1: 创建 src/ipc/channel/schemas.ts**

```typescript
import { z } from "zod";

export const adapterStatusSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  status: z.enum(["disconnected", "connecting", "connected", "error"]),
  errorMessage: z.string().optional(),
});

export const enableAdapterInputSchema = z.object({ slug: z.string(), env: z.record(z.string(), z.string()) });
export const disableAdapterInputSchema = z.object({ slug: z.string() });

export type AdapterStatus = z.infer<typeof adapterStatusSchema>;
```

- [ ] **Step 2: 创建 src/ipc/channel/handlers.ts**

```typescript
import { os } from "@orpc/server";
import { enableAdapterInputSchema, disableAdapterInputSchema } from "./schemas";

function getServices() { return (globalThis as Record<string, unknown>).__services as { chatService: { getAdapters(): unknown[]; getEnabledAdapters(): unknown[]; enableAdapter(s: string, e: Record<string, string>): Promise<void>; disableAdapter(s: string): Promise<void> } }; }

export const listAdapters = os.handler(() => getServices().chatService.getAdapters());
export const listEnabledAdapters = os.handler(() => getServices().chatService.getEnabledAdapters());
export const enableAdapter = os.input(enableAdapterInputSchema).handler(async ({ input }) => {
  await getServices().chatService.enableAdapter(input.slug, input.env);
  return { success: true };
});
export const disableAdapter = os.input(disableAdapterInputSchema).handler(async ({ input }) => {
  await getServices().chatService.disableAdapter(input.slug);
  return { success: true };
});
```

- [ ] **Step 3: 创建 src/ipc/channel/index.ts**

```typescript
import { listAdapters, listEnabledAdapters, enableAdapter, disableAdapter } from "./handlers";
export const channel = { listAdapters, listEnabledAdapters, enableAdapter, disableAdapter };
```

- [ ] **Step 4: 创建 src/ipc/acp/schemas.ts**

```typescript
import { z } from "zod";

export const acpServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string(), z.string()).optional(),
});

export const addAcpServerInputSchema = acpServerSchema;
export const removeAcpServerInputSchema = z.object({ id: z.string() });
export const connectAcpServerInputSchema = z.object({ id: z.string() });
export const disconnectAcpServerInputSchema = z.object({ id: z.string() });

export type AcpServerStatus = z.infer<typeof acpServerSchema> & { status: "disconnected" | "connecting" | "connected" | "error"; error?: string };
```

- [ ] **Step 5: 创建 src/ipc/acp/handlers.ts + index.ts**

```typescript
// handlers.ts
import { os } from "@orpc/server";
import { addAcpServerInputSchema, removeAcpServerInputSchema, connectAcpServerInputSchema } from "./schemas";

function getServices() {
  return (globalThis as Record<string, unknown>).__services as {
    acpService: {
      getServers(): unknown[];
      addServer(c: unknown): void;
      removeServer(id: string): void;
      connect(id: string): Promise<void>;
      disconnect(id: string): void;
      getServerStatus(id: string): string;
    };
  };
}

export const listAcpServers = os.handler(() => {
  const acp = getServices().acpService;
  return acp.getServers().map((s) => ({ ...(s as object), status: acp.getServerStatus((s as { id: string }).id) }));
});

export const addAcpServer = os.input(addAcpServerInputSchema).handler(async ({ input }) => {
  getServices().acpService.addServer(input);
  return { success: true };
});

export const removeAcpServer = os.input(removeAcpServerInputSchema).handler(async ({ input }) => {
  getServices().acpService.removeServer(input.id);
  return { success: true };
});

export const connectAcpServer = os.input(connectAcpServerInputSchema).handler(async ({ input }) => {
  await getServices().acpService.connect(input.id);
  return { success: true };
});

export const disconnectAcpServer = os.input(connectAcpServerInputSchema).handler(async ({ input }) => {
  getServices().acpService.disconnect(input.id);
  return { success: true };
});
```

```typescript
// index.ts
import { listAcpServers, addAcpServer, removeAcpServer, connectAcpServer, disconnectAcpServer } from "./handlers";
export const acp = { listAcpServers, addAcpServer, removeAcpServer, connectAcpServer, disconnectAcpServer };
```

- [ ] **Step 6: 创建 src/ipc/conversation/ — schemas + handlers + index**

```typescript
// schemas.ts
import { z } from "zod";

export const conversationSchema = z.object({
  id: z.string(),
  adapter: z.string(),
  agentId: z.string().nullable(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const transcriptSchema = z.object({
  id: z.number(),
  conversationId: z.string(),
  role: z.enum(["user", "agent"]),
  content: z.string(),
  createdAt: z.number(),
});

export type Conversation = z.infer<typeof conversationSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;

export const getConversationInputSchema = z.object({ id: z.string() });
export const getMessagesInputSchema = z.object({ conversationId: z.string() });
```

```typescript
// handlers.ts
import { os } from "@orpc/server";
import { getDatabase } from "@/services/persistence";
import { getConversationInputSchema, getMessagesInputSchema } from "./schemas";

export const listConversations = os.handler(() => {
  const db = getDatabase();
  return db.prepare(`SELECT id, adapter, agent_id as agentId, title, created_at as createdAt, updated_at as updatedAt FROM conversations ORDER BY updated_at DESC LIMIT 50`).all();
});

export const getConversation = os.input(getConversationInputSchema).handler(({ input }) => {
  const db = getDatabase();
  return db.prepare(`SELECT id, adapter, agent_id as agentId, title, created_at as createdAt, updated_at as updatedAt FROM conversations WHERE id = ?`).get(input.id);
});

export const getMessages = os.input(getMessagesInputSchema).handler(({ input }) => {
  const db = getDatabase();
  return db.prepare(`SELECT id, conversation_id as conversationId, role, content, created_at as createdAt FROM transcripts WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 100`).all(input.conversationId);
});
```

```typescript
// index.ts
import { listConversations, getConversation, getMessages } from "./handlers";
export const conversation = { listConversations, getConversation, getMessages };
```

- [ ] **Step 7: 创建 src/ipc/events/ — schemas + handlers + index**

```typescript
// event-types.ts (直接从 event-bridge 复制类型)
export type AppEvent =
  | { type: "message_received"; threadId: string; adapter: string; message: { text: string; authorName: string; channelName: string | null; isMention: boolean } }
  | { type: "message_sent"; threadId: string; adapter: string; text: string }
  | { type: "adapter_status_changed"; adapter: string; status: string; error?: string }
  | { type: "acp_session_update"; sessionId: string; threadId: string; text: string }
  | { type: "acp_server_status_changed"; serverId: string; status: string; error?: string }
  | { type: "agent_error"; threadId: string; adapter: string; error: string };
```

```typescript
// handlers.ts — 使用 oRPC Subscription 实现实时推送
import { os } from "@orpc/server";
import type { AppEvent } from "./event-types";
import type { EventBridge } from "@/services/chat/event-bridge";

export const subscribe = os.handler(async function* () {
  const services = (globalThis as Record<string, unknown>).__services as { eventBridge: EventBridge } | undefined;
  if (!services?.eventBridge) return;

  const unsubscribe = services.eventBridge.onEvent((event: AppEvent) => {
    // yield 不支持在回调中，用 Promise + resolve 模式
  });

  // 注意: oRPC Subscription 的 yield 模式需要适配
  // 简化方案：使用 setInterval 轮询
  const events: AppEvent[] = [];
  const unsub = services.eventBridge.onEvent((e: AppEvent) => events.push(e));

  for (;;) {
    while (events.length > 0) {
      yield events.shift()!;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
});
```

Wait — `@orpc/server` 的 subscription 在不同版本语法不同。根据项目已有的版本 (`^1.14.6`)，subscription 通常使用 `os.handler(async function* () { ... })` generator 模式。但 handler 的 yield 需要配合 client 端的 subscribe 调用。

考虑到 @orpc/server 的 subscription API 可能不够直观，Phase 1 采用简化方案：渲染进程通过轮询 (`setInterval` + `invalidateQueries`) 获取最新状态，不通过 oRPC Subscription 推送事件。

简化 events IPC 为：提供 `getRecentEvents()` 方法，返回最近事件列表。

```typescript
// handlers.ts (简化版)
import { os } from "@orpc/server";
import type { EventBridge } from "@/services/chat/event-bridge";
import type { AppEvent } from "./event-types";

const recentEvents: AppEvent[] = [];
const MAX_EVENTS = 100;

// 在 bootstrap 时注册事件收集
export function registerEventCollector(): void {
  const services = (globalThis as Record<string, unknown>).__services as { eventBridge: EventBridge } | undefined;
  services?.eventBridge.onEvent((event: AppEvent) => {
    recentEvents.push(event);
    if (recentEvents.length > MAX_EVENTS) recentEvents.shift();
  });
}

export const getRecentEvents = os.handler(() => recentEvents.splice(0, recentEvents.length));
```

```typescript
// index.ts
import { getRecentEvents, registerEventCollector } from "./handlers";
export { registerEventCollector };
export const events = { getRecentEvents };
```

- [ ] **Step 8: 修改 src/ipc/router.ts**

```typescript
import { acp } from "./acp";
import { app } from "./app";
import { channel } from "./channel";
import { conversation } from "./conversation";
import { events } from "./events";
import { shell } from "./shell";
import { theme } from "./theme";
import { window } from "./window";

export const router = { theme, window, app, shell, channel, acp, conversation, events };
```

- [ ] **Step 9: 修改 src/services/bootstrap.ts 注册事件收集器**

在 `bootstrapServices()` 末尾添加：

```typescript
const { registerEventCollector } = await import("@/ipc/events");
registerEventCollector();
```

- [ ] **Step 10: Commit**

```bash
git add src/ipc/
git commit -m "feat(ipc): add channel, acp, conversation, events IPC domains"
```

---

### Task 7: 渲染进程 — Actions 层

**Files:**
- Rewrite: `src/actions/channel.ts`
- Create: `src/actions/acp.ts`
- Create: `src/actions/conversation.ts`
- Create: `src/actions/events.ts`

- [ ] **Step 1: 重写 src/actions/channel.ts**

```typescript
import { ipc } from "@/ipc/manager";
import type { AdapterStatus } from "@/ipc/channel/schemas";

export function listAdapters(): Promise<AdapterStatus[]> { return ipc.client.channel.listAdapters(); }
export function listEnabledAdapters(): Promise<AdapterStatus[]> { return ipc.client.channel.listEnabledAdapters(); }
export function enableAdapter(slug: string, env: Record<string, string>): Promise<{ success: boolean }> { return ipc.client.channel.enableAdapter({ slug, env }); }
export function disableAdapter(slug: string): Promise<{ success: boolean }> { return ipc.client.channel.disableAdapter({ slug }); }
```

- [ ] **Step 2: 创建 src/actions/acp.ts**

```typescript
import { ipc } from "@/ipc/manager";
import type { AcpServerStatus } from "@/ipc/acp/schemas";

export function listAcpServers(): Promise<AcpServerStatus[]> { return ipc.client.acp.listAcpServers(); }
export function addAcpServer(config: { id: string; name: string; command: string; args: string[]; env?: Record<string, string> }): Promise<{ success: boolean }> { return ipc.client.acp.addAcpServer(config); }
export function removeAcpServer(id: string): Promise<{ success: boolean }> { return ipc.client.acp.removeAcpServer({ id }); }
export function connectAcpServer(id: string): Promise<{ success: boolean }> { return ipc.client.acp.connectAcpServer({ id }); }
export function disconnectAcpServer(id: string): Promise<{ success: boolean }> { return ipc.client.acp.disconnectAcpServer({ id }); }
```

- [ ] **Step 3: 创建 src/actions/conversation.ts**

```typescript
import { ipc } from "@/ipc/manager";
import type { Conversation, Transcript } from "@/ipc/conversation/schemas";

export function listConversations(): Promise<Conversation[]> { return ipc.client.conversation.listConversations(); }
export function getConversation(id: string): Promise<Conversation | null> { return ipc.client.conversation.getConversation({ id }); }
export function getMessages(conversationId: string): Promise<Transcript[]> { return ipc.client.conversation.getMessages({ conversationId }); }
```

- [ ] **Step 4: 创建 src/actions/events.ts**

```typescript
import { ipc } from "@/ipc/manager";
import type { AppEvent } from "@/ipc/events/event-types";

export function getRecentEvents(): Promise<AppEvent[]> { return ipc.client.events.getRecentEvents(); }
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/
git commit -m "feat(actions): add channel, acp, conversation, events action layers"
```

---

### Task 8: 渲染进程 — Hooks 层

**Files:**
- Create: `src/hooks/use-channels.ts`
- Create: `src/hooks/use-conversations.ts`
- Create: `src/hooks/use-acp-servers.ts`
- Create: `src/hooks/use-event-poller.ts`

- [ ] **Step 1: 创建 src/hooks/use-channels.ts**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAdapters, enableAdapter, disableAdapter } from "@/actions/channel";

export function useChannels() {
  return useQuery({ queryKey: ["channels"], queryFn: listAdapters, refetchInterval: 5000 });
}

export function useEnableAdapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, env }: { slug: string; env: Record<string, string> }) => enableAdapter(slug, env),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["channels"] }); },
  });
}

export function useDisableAdapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => disableAdapter(slug),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["channels"] }); },
  });
}
```

- [ ] **Step 2: 创建 src/hooks/use-conversations.ts**

```typescript
import { useQuery } from "@tanstack/react-query";
import { listConversations, getMessages } from "@/actions/conversation";

export function useConversations() {
  return useQuery({ queryKey: ["conversations"], queryFn: listConversations, refetchInterval: 3000 });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => conversationId ? getMessages(conversationId) : [],
    enabled: !!conversationId,
    refetchInterval: 1000,
  });
}
```

- [ ] **Step 3: 创建 src/hooks/use-acp-servers.ts**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAcpServers, addAcpServer, removeAcpServer, connectAcpServer, disconnectAcpServer } from "@/actions/acp";
import type { AcpServerStatus } from "@/ipc/acp/schemas";

export function useAcpServers() {
  return useQuery({ queryKey: ["acp-servers"], queryFn: listAcpServers, refetchInterval: 5000 });
}

export function useAddAcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: Parameters<typeof addAcpServer>[0]) => addAcpServer(config),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["acp-servers"] }); },
  });
}

export function useRemoveAcpServer() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: removeAcpServer, onSuccess: () => { qc.invalidateQueries({ queryKey: ["acp-servers"] }); } });
}

export function useConnectAcpServer() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: connectAcpServer, onSuccess: () => { qc.invalidateQueries({ queryKey: ["acp-servers"] }); } });
}

export function useDisconnectAcpServer() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: disconnectAcpServer, onSuccess: () => { qc.invalidateQueries({ queryKey: ["acp-servers"] }); } });
}
```

- [ ] **Step 4: 创建 src/hooks/use-event-poller.ts**

```typescript
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getRecentEvents } from "@/actions/events";
import type { AppEvent } from "@/ipc/events/event-types";

export function useEventPoller() {
  const qc = useQueryClient();

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const events = await getRecentEvents();
        for (const event of events) {
          switch (event.type) {
            case "message_received":
            case "message_sent":
            case "agent_error":
              qc.invalidateQueries({ queryKey: ["conversations"] });
              qc.invalidateQueries({ queryKey: ["messages"] });
              break;
            case "adapter_status_changed":
              qc.invalidateQueries({ queryKey: ["channels"] });
              break;
            case "acp_server_status_changed":
              qc.invalidateQueries({ queryKey: ["acp-servers"] });
              break;
          }
        }
      } catch { /* ignore poll errors */ }
    }, 1000);

    return () => clearInterval(interval);
  }, [qc]);
}
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/
git commit -m "feat(hooks): add useChannels, useConversations, useAcpServers, useEventPoller"
```

---

### Task 9: 渲染进程 — 渠道管理 UI

**Files:**
- Create: `src/components/channel/adapter-card.tsx`
- Create: `src/components/channel/adapter-env-dialog.tsx`
- Create: `src/components/channel/adapter-status.tsx`
- Create: `src/components/channel/channel-page.tsx`
- Modify: `src/routes/channel.tsx`（指向新组件）

- [ ] **Step 1: 创建 src/components/channel/adapter-status.tsx**

```typescript
import { Badge } from "@/components/ui/badge";

interface Props { status: string; error?: string; }

export function AdapterStatus({ status, error }: Props) {
  const variant = status === "connected" ? "default" : status === "connecting" ? "secondary" : status === "error" ? "destructive" : "outline";
  const label = status === "connected" ? "已连接" : status === "connecting" ? "连接中..." : status === "error" ? `错误: ${error ?? "未知"}` : "未连接";
  return <Badge variant={variant} className="text-xs">{label}</Badge>;
}
```

- [ ] **Step 2: 创建 src/components/channel/adapter-env-dialog.tsx**

```typescript
import { useState } from "react";
import { getAdapter } from "chat/adapters";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEnableAdapter } from "@/hooks/use-channels";

interface Props { slug: string; name: string; open: boolean; onOpenChange: (open: boolean) => void; }

export function AdapterEnvDialog({ slug, name, open, onOpenChange }: Props) {
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const mutation = useEnableAdapter();
  const meta = getAdapter(slug);
  const envVars = meta?.env ? [...(meta.env.required ?? []), ...(meta.env.optional ?? [])] : [];

  const handleEnable = async () => {
    await mutation.mutateAsync({ slug, env: envValues });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>配置 {name}</DialogTitle>
          <DialogDescription>请填写适配器所需的环境变量</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          {envVars.map((v) => (
            <div className="space-y-1" key={v.key}>
              <Label htmlFor={`env-${v.key}`}>{v.key}{v.secret && <span className="ml-1 text-destructive text-xs">(密钥)</span>}</Label>
              <Input id={`env-${v.key}`} type={v.secret ? "password" : "text"} placeholder={v.description} value={envValues[v.key] ?? ""} onChange={(e) => setEnvValues((p) => ({ ...p, [v.key]: e.target.value }))} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleEnable} disabled={mutation.isPending}>启用</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: 创建 src/components/channel/adapter-card.tsx**

```typescript
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { AdapterStatus } from "./adapter-status";
import { AdapterEnvDialog } from "./adapter-env-dialog";
import { useDisableAdapter } from "@/hooks/use-channels";
import type { AdapterStatus as AdapterStatusType } from "@/ipc/channel/schemas";

interface Props { adapter: AdapterStatusType; }

export function AdapterCard({ adapter }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const disableMutation = useDisableAdapter();

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-sm">{adapter.name}</span>
            <AdapterStatus status={adapter.status} error={adapter.errorMessage} />
          </div>
          <p className="mt-0.5 text-muted-foreground text-xs">{adapter.description}</p>
        </div>
        <Switch
          checked={adapter.enabled}
          onCheckedChange={(checked) => {
            if (checked) setDialogOpen(true);
            else disableMutation.mutate(adapter.slug);
          }}
        />
      </CardContent>
      <AdapterEnvDialog slug={adapter.slug} name={adapter.name} open={dialogOpen} onOpenChange={setDialogOpen} />
    </Card>
  );
}
```

- [ ] **Step 4: 创建 src/components/channel/channel-page.tsx**

```typescript
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { AdapterCard } from "./adapter-card";
import { useChannels } from "@/hooks/use-channels";

export default function ChannelPage() {
  const { t } = useTranslation();
  const { data: adapters, isLoading } = useChannels();

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("channel.adapters", "渠道管理")}</CardTitle>
          <CardDescription>{t("channel.adaptersDesc", "配置和管理 Chat SDK 平台适配器")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />加载中...</div>}
          <div className="space-y-3">
            {adapters?.map((a) => <AdapterCard key={a.slug} adapter={a} />)}
          </div>
          {adapters?.length === 0 && !isLoading && <p className="py-4 text-center text-muted-foreground text-sm">暂无可用适配器</p>}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: 修改 src/routes/channel.tsx**

```typescript
import { createFileRoute } from "@tanstack/react-router";
import ChannelPage from "@/components/channel/channel-page";

export const Route = createFileRoute("/channel")({ component: ChannelPage });
```

- [ ] **Step 6: Commit**

```bash
git add src/components/channel/ src/routes/channel.tsx
git commit -m "feat(ui): add channel management page with adapter CRUD"
```

---

### Task 10: 渲染进程 — 对话列表 + 消息面板 UI

**Files:**
- Create: `src/components/conversation/conversation-list.tsx`
- Create: `src/components/conversation/conversation-item.tsx`
- Create: `src/components/conversation/message-panel.tsx`
- Create: `src/routes/conversation.tsx`
- Create: `src/routes/conversation.$id.tsx`

- [ ] **Step 1: 创建 src/components/conversation/conversation-item.tsx**

```typescript
import { Link } from "@tanstack/react-router";
import type { Conversation } from "@/ipc/conversation/schemas";

interface Props { conversation: Conversation; }

export function ConversationItem({ conversation }: Props) {
  return (
    <Link to="/conversation/$id" params={{ id: conversation.id }} className="block rounded-lg border p-3 transition-colors hover:bg-accent">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <span className="truncate font-medium text-sm">{conversation.title || conversation.id}</span>
          <p className="mt-0.5 text-muted-foreground text-xs">{conversation.adapter} · {new Date(conversation.updatedAt).toLocaleString()}</p>
        </div>
        {conversation.agentId && <span className="shrink-0 text-muted-foreground text-xs">{conversation.agentId}</span>}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: 创建 src/components/conversation/conversation-list.tsx**

```typescript
import { useConversations } from "@/hooks/use-conversations";
import { ConversationItem } from "./conversation-item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";

export function ConversationList() {
  const { data: conversations, isLoading } = useConversations();

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-2">
        {isLoading && <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />加载中...</div>}
        {conversations?.map((c) => <ConversationItem key={c.id} conversation={c} />)}
        {conversations?.length === 0 && !isLoading && <p className="py-8 text-center text-muted-foreground text-sm">暂无对话</p>}
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 3: 创建 src/components/conversation/message-panel.tsx**

```typescript
import { useMessages } from "@/hooks/use-conversations";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";

interface Props { conversationId: string; }

export function MessagePanel({ conversationId }: Props) {
  const { data: messages, isLoading } = useMessages(conversationId);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-4">
        {isLoading && <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />加载中...</div>}
        {messages?.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-lg px-4 py-2 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              <p className="whitespace-pre-wrap text-sm">{m.content}</p>
              <span className="mt-1 block text-right text-xs opacity-70">{new Date(m.createdAt).toLocaleTimeString()}</span>
            </div>
          </div>
        ))}
        {messages?.length === 0 && !isLoading && <p className="py-8 text-center text-muted-foreground text-sm">暂无消息</p>}
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 4: 创建路由文件**

```typescript
// src/routes/conversation.tsx
import { createFileRoute } from "@tanstack/react-router";
import { ConversationList } from "@/components/conversation/conversation-list";

export const Route = createFileRoute("/conversation")({ component: ConversationList });
```

```typescript
// src/routes/conversation.$id.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useConversation } from "@/hooks/use-conversations";
import { MessagePanel } from "@/components/conversation/message-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function ConversationDetail() {
  const { id } = Route.useParams();
  const { data: conv } = useConversation(id);

  return (
    <div className="flex h-full flex-col p-4">
      <Card className="flex flex-1 flex-col">
        <CardHeader>
          <CardTitle className="text-sm">{conv?.title || id}</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1">
          <MessagePanel conversationId={id} />
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/conversation/$id")({ component: ConversationDetail });
```

- [ ] **Step 5: 在 use-conversations.ts 中添加 useConversation hook**

```typescript
// 追加到 src/hooks/use-conversations.ts
import { getConversation } from "@/actions/conversation";

export function useConversation(id: string) {
  return useQuery({ queryKey: ["conversation", id], queryFn: () => getConversation(id), enabled: !!id });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/conversation/ src/routes/conversation.tsx src/routes/conversation.\$id.tsx src/hooks/use-conversations.ts
git commit -m "feat(ui): add conversation list and message panel"
```

---

### Task 11: 渲染进程 — ACP Server 设置页面

**Files:**
- Create: `src/components/settings/acp-server-form.tsx`
- Create: `src/components/settings/acp-server-page.tsx`
- Create: `src/routes/settings.tsx`

- [ ] **Step 1: 创建 src/components/settings/acp-server-form.tsx**

```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAddAcpServer } from "@/hooks/use-acp-servers";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; }

export function AcpServerForm({ open, onOpenChange }: Props) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [argsStr, setArgsStr] = useState("");
  const mutation = useAddAcpServer();

  const handleAdd = async () => {
    const id = `acp-${Date.now()}`;
    const args = argsStr.split(/\s+/).filter(Boolean);
    await mutation.mutateAsync({ id, name, command, args });
    setName(""); setCommand(""); setArgsStr("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加 ACP Server</DialogTitle>
          <DialogDescription>配置要连接的 Agent Client Protocol 服务器</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <div className="space-y-1">
            <Label htmlFor="acp-name">名称</Label>
            <Input id="acp-name" placeholder="如: Claude Agent" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="acp-cmd">命令</Label>
            <Input id="acp-cmd" placeholder="如: npx" value={command} onChange={(e) => setCommand(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="acp-args">参数 (空格分隔)</Label>
            <Input id="acp-args" placeholder="如: @anthropic/claude-agent" value={argsStr} onChange={(e) => setArgsStr(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleAdd} disabled={mutation.isPending || !name || !command}>添加</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 创建 src/components/settings/acp-server-page.tsx**

```typescript
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Plug, Unplug, Loader2 } from "lucide-react";
import { AcpServerForm } from "./acp-server-form";
import { useAcpServers, useRemoveAcpServer, useConnectAcpServer, useDisconnectAcpServer } from "@/hooks/use-acp-servers";

export default function AcpServerPage() {
  const { t } = useTranslation();
  const [formOpen, setFormOpen] = useState(false);
  const { data: servers, isLoading } = useAcpServers();
  const removeMutation = useRemoveAcpServer();
  const connectMutation = useConnectAcpServer();
  const disconnectMutation = useDisconnectAcpServer();

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">{t("settings.acp", "ACP Server 管理")}</h2>
        <Button size="sm" onClick={() => setFormOpen(true)}><Plus className="mr-1 h-4 w-4" />添加</Button>
      </div>
      {isLoading && <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />加载中...</div>}
      <div className="space-y-3">
        {servers?.map((s) => (
          <Card key={s.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{s.name}</span>
                  <Badge variant={s.status === "connected" ? "default" : "outline"} className="text-xs">{s.status}</Badge>
                </div>
                <p className="mt-0.5 text-muted-foreground text-xs">{s.command} {s.args.join(" ")}</p>
              </div>
              <div className="flex gap-1">
                {s.status === "connected" ? (
                  <Button size="sm" variant="outline" onClick={() => disconnectMutation.mutate(s.id)}><Unplug className="h-4 w-4" /></Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => connectMutation.mutate(s.id)} disabled={connectMutation.isPending}><Plug className="h-4 w-4" /></Button>
                )}
                <Button size="sm" variant="outline" onClick={() => removeMutation.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <AcpServerForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
```

- [ ] **Step 3: 创建 src/routes/settings.tsx**

```typescript
import { createFileRoute } from "@tanstack/react-router";
import AcpServerPage from "@/components/settings/acp-server-page";

export const Route = createFileRoute("/settings")({ component: AcpServerPage });
```

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/ src/routes/settings.tsx
git commit -m "feat(ui): add ACP server settings page"
```

---

### Task 12: 更新侧边栏 + 全局 event poller + react-query provider

**Files:**
- Modify: `src/components/app-sidebar.tsx`（更新导航项）
- Modify: `src/app.tsx`（添加 react-query provider + event poller）

- [ ] **Step 1: 修改 src/components/app-sidebar.tsx 导航**

在现有的侧边栏导航中添加新菜单项。找到 `navSecondary` 或主菜单数组，替换/添加：

```typescript
// 确保导航项包含:
const items = [
  { title: "首页", url: "/", icon: House },
  { title: "对话", url: "/conversation", icon: MessageCircle },
  { title: "渠道", url: "/channel", icon: Plug },
  { title: "设置", url: "/settings", icon: Settings },
];
```

（具体实现取决于现有 app-sidebar.tsx 的代码结构，需要读取后精确修改）

- [ ] **Step 2: 修改 src/app.tsx 添加 react-query provider**

```typescript
// 在 app.tsx 中包裹 QueryClientProvider
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

// 在 RouterProvider 外包裹
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* 现有的 RouterProvider / ThemeProvider 等 */}
      <EventPoller />
    </QueryClientProvider>
  );
}
```

创建 `src/components/event-poller.tsx`:

```typescript
import { useEventPoller } from "@/hooks/use-event-poller";

export function EventPoller() {
  useEventPoller();
  return null;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/app-sidebar.tsx src/app.tsx src/components/event-poller.tsx
git commit -m "feat(ui): update sidebar, add react-query provider and event poller"
```

---

### Task 13: 清理旧代码 + 路由重新生成

**Files:**
- Delete: `src/services/channel.ts`
- Delete: `src/components/channel-page.tsx`
- Delete old `src/ipc/channel/` (已被重写)
- Delete `src/routes/second.tsx` (占位页面)
- Modify: `src/routeTree.gen.ts` (运行 `bun run start` 触发重新生成)

- [ ] **Step 1: 删除旧文件**

```bash
rm src/services/channel.ts
rm src/components/channel-page.tsx
rm src/routes/second.tsx
```

- [ ] **Step 2: 重新生成路由树**

```bash
# TanStack Router 在 dev 模式下自动生成，启动一次开发服务器即可
bun run start &
# 等待几秒让路由树生成
sleep 5
kill %1
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove legacy channel service, old components, and placeholder route"
```

---

### Task 14: 端到端验证

- [ ] **Step 1: 启动应用并检查 UI**

```bash
bun run start
```

验证:
1. 侧边栏显示新导航项（对话、渠道、设置）
2. 渠道页面显示飞书和 Telegram 适配器卡片（显示"未连接"状态）
3. 设置页面可以添加 ACP Server
4. 对话页面显示为空

- [ ] **Step 2: 测试渠道启用流程**

1. 点击飞书适配器的 Switch → 弹出凭据配置对话框
2. 填入 appId 和 appSecret → 点击启用
3. 飞书适配器状态变为"已连接"
4. 在飞书中向机器人 @ 发送消息
5. 检查对话页面是否出现新对话

- [ ] **Step 3: 测试 ACP 连接**

1. 在设置页面添加一个 ACP Server
   - 名称: "Claude Agent"
   - 命令: `npx`
   - 参数: `@anthropic/claude-agent`
2. 点击连接按钮 → 状态变为 "connected"

- [ ] **Step 4: 测试端到端消息流**

1. 确认飞书适配器已连接
2. 在飞书中发送消息给机器人
3. 检查对话页面是否实时显示消息
4. 检查 ACP Agent 是否有响应
5. 检查响应是否返回给飞书

- [ ] **Step 5: 运行单元测试**

```bash
bun run test
```

---

## 验证清单

- [ ] `bun run start` 启动成功，无报错
- [ ] 侧边栏导航正确（首页、对话、渠道、设置）
- [ ] 渠道页面列出飞书和 Telegram
- [ ] 启用/禁用适配器正常切换
- [ ] 适配器凭据持久化（重启后保留）
- [ ] ACP Server 添加/删除/连接/断开正常
- [ ] IM 消息接收后对话列表实时更新
- [ ] 对话详情页显示消息历史
- [ ] ACP Agent 响应流式返回 IM
- [ ] `bun run test` 全部通过
