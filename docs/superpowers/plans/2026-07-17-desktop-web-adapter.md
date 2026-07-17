# 桌面端 Web Adapter 接入实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将桌面端升级为 Chat SDK 一等消息渠道，通过 `@chat-adapter/web` 让 renderer 用 `useChat` 直接发消息触发 ACP，与 IM 渠道共用同一 handler。

**Architecture:** main 进程内置 127.0.0.1 HTTP server 挂 web adapter webhook；renderer 用 `@chat-adapter/web/react` 的 `useChat` POST 直连该 server；oRPC 继续管非对话流操作；按 `conversation.adapter` 在 MessagePanel 分发 WebChat（useChat 闭环）/ IMChat（只读历史）。

**Tech Stack:** `@chat-adapter/web` + `@chat-adapter/web/react`、AI SDK `useChat`、`ai-elements`、oRPC、Vitest + jsdom、Playwright。

## Global Constraints

- 包管理器：bun（锁文件 `bun.lock`），禁止 npm/yarn/pnpm
- TypeScript：`noUnusedLocals`、`noUnusedParameters`、`erasableSyntaxOnly` 已启用；禁止 `enum`/`namespace`
- 不可修改：`src/components/ui/`、`src/components/ai-elements/`、`src/routeTree.gen.ts`
- Electron 安全：CSP 保留 `script-src 'self'`；`connect-src` 仅放开 `http://127.0.0.1:*`；web server 只绑 `127.0.0.1`
- 外部依赖：禁止绕过 Chat SDK 重新实现渠道协议；禁止绕过 ACP Server 直接执行 Agent
- 图标：统一用 `lucide-react`
- 样式：视觉属性走 shadcn/ui + Tailwind 主题 token；自定义 class 仅用于排版布局
- 测试命令：`bun run test:unit`（Vitest）、`bun run check-types`（tsc）、`bun run fix`（Biome）、`bun run test:e2e`（Playwright）
- 所有回复使用简体中文，专业名词除外
- Commit 规范：Conventional Commits（feat/fix/refactor/test/chore）

参考 spec：`docs/superpowers/specs/2026-07-17-desktop-web-adapter-design.md`

---

## File Structure

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/services/web/index.ts` | 导出 `createWebHttpServer`、`createLocalWebAdapter` |
| `src/services/web/adapter.ts` | `createLocalWebAdapter()` 包装 `createWebAdapter` 固定 `getUser` |
| `src/services/web/server.ts` | `createWebHttpServer(chat, opts)` 本地 HTTP server |
| `src/ipc/web/handlers.ts` | `getEndpoint` oRPC handler |
| `src/ipc/web/index.ts` | 导出 `web` 命名空间 |
| `src/actions/web.ts` | `getEndpoint()` action 包装 |
| `src/utils/transcript-to-ui-messages.ts` | `toUIMessages(transcripts): UIMessage[]` |
| `src/hooks/use-web-endpoint.ts` | `useWebEndpoint()` React Query hook |
| `src/components/conversation/web-chat.tsx` | WebChat：useChat + PromptInput |
| `src/components/conversation/im-chat.tsx` | IMChat：只读历史 |
| `src/tests/unit/services/web/server.test.ts` | web server 单测 |
| `src/tests/unit/services/web/adapter.test.ts` | web adapter 单测 |
| `src/tests/unit/utils/transcript-to-ui-messages.test.ts` | 转换工具单测 |
| `src/tests/unit/hooks/use-web-endpoint.test.ts` | hook 单测 |
| `src/tests/unit/components/web-chat.test.tsx` | WebChat 组件单测 |
| `src/tests/unit/components/im-chat.test.tsx` | IMChat 组件单测 |
| `src/tests/unit/components/message-panel.test.tsx` | 分发逻辑单测 |
| `src/tests/e2e/web-chat-flow.test.ts` | 端到端流式 + 持久化 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/services/chat/adapter-registry.ts` | `SUPPORTED` 追加 `"web"`；`loadAdapter` 走本地路径 |
| `src/services/bootstrap.ts` | ChatService 初始化后启 web HTTP server 并存全局 |
| `src/ipc/router.ts` | 注册 `web` 命名空间 |
| `src/components/conversation/message-panel.tsx` | 重写为按 adapter 分发 |
| `src/components/conversation/conversation-list.tsx` | 新增"新建会话"按钮 |
| `index.html` | CSP 补 `connect-src 'self' http://127.0.0.1:*` |

### 删除文件

| 文件 | 随带删除测试 |
|------|------------|
| `src/hooks/use-streaming-message.ts` | `src/tests/unit/hooks/use-streaming-message.test.ts` |
| `src/hooks/use-event-stream.ts` | （无测试） |
| `src/utils/message-merge.ts` | `src/tests/unit/utils/message-merge.test.ts` |
| `src/ipc/events/handlers.ts` 的 `subscribe` 端点 | `src/tests/unit/ipc/events-subscription.test.ts` |

---

## Task 1: Transcript → UIMessage 转换工具

**Files:**
- Create: `src/utils/transcript-to-ui-messages.ts`
- Test: `src/tests/unit/utils/transcript-to-ui-messages.test.ts`

**Interfaces:**
- Consumes: `Transcript`（来自 `@/ipc/conversation/schemas`，字段 `id:number`、`conversationId:string`、`role:"user"|"agent"`、`content:string`、`createdAt:number`）
- Produces: `toUIMessages(transcripts: Transcript[]): UIMessage[]`，UIMessage 来自 `ai`，每条 `{id, role, parts:[{type:"text",text,state:"done"}], metadata:{createdAt:Date}}`

- [ ] **Step 1: 写失败测试**

```ts
// src/tests/unit/utils/transcript-to-ui-messages.test.ts
import { describe, expect, it } from "vitest";
import type { Transcript } from "@/ipc/conversation/schemas";
import { toUIMessages } from "@/utils/transcript-to-ui-messages";

describe("toUIMessages", () => {
  it("maps user transcript to user UIMessage with done text part", () => {
    const transcripts: Transcript[] = [
      {
        content: "hello",
        conversationId: "c1",
        createdAt: 1000,
        id: 1,
        role: "user",
      },
    ];
    const result = toUIMessages(transcripts);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
    expect(result[0].parts).toEqual([
      { type: "text", text: "hello", state: "done" },
    ]);
    expect(result[0].id).toBe("t-1");
    expect((result[0].metadata as { createdAt: Date }).createdAt).toEqual(
      new Date(1000)
    );
  });

  it("maps agent transcript to assistant UIMessage", () => {
    const transcripts: Transcript[] = [
      {
        content: "hi back",
        conversationId: "c1",
        createdAt: 2000,
        id: 2,
        role: "agent",
      },
    ];
    const result = toUIMessages(transcripts);
    expect(result[0].role).toBe("assistant");
  });

  it("returns empty array for empty input", () => {
    expect(toUIMessages([])).toEqual([]);
  });

  it("uses index fallback when id is undefined", () => {
    const transcripts = [
      {
        content: "x",
        conversationId: "c1",
        createdAt: 1000,
        id: undefined as unknown as number,
        role: "user" as const,
      },
    ];
    const result = toUIMessages(transcripts);
    expect(result[0].id).toBe("t-0");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `bun run test:unit -- transcript-to-ui-messages`
Expected: FAIL with "toUIMessages is not defined" 或导入解析失败

- [ ] **Step 3: 实现最小代码**

```ts
// src/utils/transcript-to-ui-messages.ts
import type { UIMessage } from "ai";
import type { Transcript } from "@/ipc/conversation/schemas";

export function toUIMessages(transcripts: Transcript[]): UIMessage[] {
  return transcripts.map((t, i) => ({
    id: `t-${t.id ?? i}`,
    metadata: { createdAt: new Date(t.createdAt) },
    parts: [{ state: "done" as const, text: t.content, type: "text" as const }],
    role: t.role === "user" ? "user" : "assistant",
  }));
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `bun run test:unit -- transcript-to-ui-messages`
Expected: PASS

- [ ] **Step 5: 类型检查 + lint**

Run: `bun run check-types && bun run fix`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add src/utils/transcript-to-ui-messages.ts src/tests/unit/utils/transcript-to-ui-messages.test.ts
git commit -m "feat(utils): add transcript-to-ui-messages conversion helper"
```

---

## Task 2: createLocalWebAdapter

**Files:**
- Create: `src/services/web/adapter.ts`
- Test: `src/tests/unit/services/web/adapter.test.ts`

**Interfaces:**
- Consumes: `createWebAdapter`（来自 `@chat-adapter/web`）
- Produces:
  - `createLocalWebAdapter(): WebAdapter` — `getUser` 固定返 `{id:"local", name:"AgentLink User"}`；`threadIdFor` 返 `web:local:{conversationId}`；其他默认

- [ ] **Step 1: 写失败测试**

```ts
// src/tests/unit/services/web/adapter.test.ts
import { describe, expect, it } from "vitest";
import { createLocalWebAdapter } from "@/services/web/adapter";

describe("createLocalWebAdapter", () => {
  it("has adapter name 'web'", () => {
    const adapter = createLocalWebAdapter();
    expect(adapter.name).toBe("web");
  });

  it("encodes thread id as web:local:{conversationId}", () => {
    const adapter = createLocalWebAdapter();
    const threadId = adapter.encodeThreadId({
      conversationId: "abc123",
      userId: "local",
    });
    expect(threadId).toBe("web:local:abc123");
  });

  it("decodes thread id back to components", () => {
    const adapter = createLocalWebAdapter();
    const data = adapter.decodeThreadId("web:local:abc123");
    expect(data).toEqual({ conversationId: "abc123", userId: "local" });
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `bun run test:unit -- services/web/adapter`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// src/services/web/adapter.ts
import { createWebAdapter } from "@chat-adapter/web";
import type { WebAdapter } from "@chat-adapter/web";

export function createLocalWebAdapter(): WebAdapter {
  return createWebAdapter({
    getUser: () => ({ id: "local", name: "AgentLink User" }),
    threadIdFor: ({ user, conversationId }) =>
      `web:${user.id}:${conversationId}`,
    userName: "AgentLink",
  });
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `bun run test:unit -- services/web/adapter`
Expected: PASS

- [ ] **Step 5: 类型检查**

Run: `bun run check-types`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add src/services/web/adapter.ts src/tests/unit/services/web/adapter.test.ts
git commit -m "feat(web): add createLocalWebAdapter with fixed local user"
```

---

## Task 3: createWebHttpServer

**Files:**
- Create: `src/services/web/server.ts`、`src/services/web/index.ts`
- Test: `src/tests/unit/services/web/server.test.ts`

**Interfaces:**
- Consumes: `Chat` 实例（来自 `chat`，含 `webhooks.web(request): Promise<Response>`）
- Produces:
  - `createWebHttpServer(chat: Chat, opts?: { port?: number }): Promise<{ port: number; close: () => Promise<void> }>`
  - 仅监听 `127.0.0.1`；单路由 `POST /api/chat`；非匹配返 404；`res.close` 触发 `AbortController.abort()` 传入 `Request.signal`

- [ ] **Step 1: 写失败测试**

```ts
// src/tests/unit/services/web/server.test.ts
import { describe, expect, it } from "vitest";
import type { Chat } from "chat";
import { createWebHttpServer } from "@/services/web/server";

function makeMockChat(responseBody = "ok"): Chat {
  return {
    webhooks: {
      web: async (request: Request) =>
        new Response(responseBody, {
          headers: { "content-type": "text/plain" },
        }),
    },
  } as unknown as Chat;
}

describe("createWebHttpServer", () => {
  it("returns 404 for non-POST or wrong path", async () => {
    const { port, close } = await createWebHttpServer(makeMockChat());
    const res = await fetch(`http://127.0.0.1:${port}/unknown`);
    expect(res.status).toBe(404);
    await close();
  });

  it("proxies POST /api/chat to chat.webhooks.web and streams body back", async () => {
    const { port, close } = await createWebHttpServer(
      makeMockChat("hello-stream")
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      body: JSON.stringify({ messages: [] }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello-stream");
    await close();
  });

  it("listens only on 127.0.0.1 with OS-assigned port when port=0", async () => {
    const { port, close } = await createWebHttpServer(makeMockChat());
    expect(port).toBeGreaterThan(0);
    // 127.0.0.1 reachable, other interfaces not tested at unit level
    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      body: "{}",
      method: "POST",
    });
    expect(res.status).toBe(200);
    await close();
  });
});
```

注意：Vitest jsdom 环境需 `fetch` 可用。Node 24 全局 `fetch` 已就绪；若 setup 未启用可改用 `undici.request`。若测试环境 fetch 不可用，改用 Node `http` 客户端发请求。先按 `fetch` 写，失败再调整。

- [ ] **Step 2: 运行测试，确认失败**

Run: `bun run test:unit -- services/web/server`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// src/services/web/server.ts
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { Readable } from "node:stream";
import type { Chat } from "chat";

export interface WebHttpServer {
  port: number;
  close: () => Promise<void>;
}

export async function createWebHttpServer(
  chat: Chat,
  opts: { port?: number } = {}
): Promise<WebHttpServer> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      if (req.method !== "POST" || req.url !== "/api/chat") {
        res.writeHead(404).end();
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = Buffer.concat(chunks).toString("utf-8");

      const controller = new AbortController();
      const onClose = () => controller.abort();
      res.on("close", onClose);

      const request = new Request(`http://127.0.0.1${req.url ?? ""}`, {
        body,
        headers: req.headers as HeadersInit,
        method: "POST",
        signal: controller.signal,
      });

      try {
        const response = await chat.webhooks.web(request);
        res.on("close", () => {
          try {
            response.body?.cancel();
          } catch {
            // ignore cancel errors
          }
        });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        if (response.body) {
          const stream = Readable.fromWeb(response.body as ReadableStream);
          stream.on("error", (err) => {
            console.error("[web] stream error:", err);
            if (!res.writableEnded) res.end();
          });
          stream.pipe(res);
        } else {
          res.end();
        }
      } catch (err) {
        console.error(
          "[web] handler error:",
          err instanceof Error ? err.stack : err
        );
        if (!res.headersSent) {
          res.writeHead(500).end();
        }
      } finally {
        res.off("close", onClose);
      }
    });

    server.on("error", reject);
    server.listen(opts.port ?? 0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        address && typeof address === "object" ? address.port : 0;
      if (port === 0) {
        reject(new Error("Failed to bind web server"));
        return;
      }
      resolve({
        close: () =>
          new Promise<void>((r) => server.close(() => r())),
        port,
      });
    });
  });
}
```

```ts
// src/services/web/index.ts
export { createWebHttpServer } from "./server";
export type { WebHttpServer } from "./server";
export { createLocalWebAdapter } from "./adapter";
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `bun run test:unit -- services/web/server`
Expected: PASS（若 fetch 不可用，改用 Node `http` 客户端重写测试）

- [ ] **Step 5: 类型检查**

Run: `bun run check-types`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add src/services/web/server.ts src/services/web/index.ts src/tests/unit/services/web/server.test.ts
git commit -m "feat(web): add createWebHttpServer proxying /api/chat to Chat webhooks"
```

---

## Task 4: AdapterRegistry 支持 web

**Files:**
- Modify: `src/services/chat/adapter-registry.ts`
- Test: `src/tests/unit/services/chat/adapter-registry.test.ts`（新增）

**Interfaces:**
- Consumes: `createLocalWebAdapter`（Task 2）
- Produces: `AdapterRegistry.buildAdapterMap()` 返回的 map 始终含 `"web"` 键，不需要 enable 流程

- [ ] **Step 1: 写失败测试**

```ts
// src/tests/unit/services/chat/adapter-registry.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdapterRegistry } from "@/services/chat/adapter-registry";

vi.mock("@/services/persistence", () => {
  const makePersistenceMock = (await import(
    "@/tests/unit/helpers/persistence-mock"
  )).makePersistenceMock;
  const db = (await import("@/tests/unit/helpers/persistence-mock")).createMemoryDatabase();
  return makePersistenceMock(db, { acpServers: [], adapters: {} });
});

describe("AdapterRegistry web support", () => {
  it("SUPPORTED includes 'web'", () => {
    const reg = new AdapterRegistry();
    const list = reg.list();
    expect(list.some((a) => a.slug === "web")).toBe(true);
  });

  it("buildAdapterMap always includes 'web' without enabling", async () => {
    const reg = new AdapterRegistry();
    const map = await reg.buildAdapterMap();
    expect(map.web).toBeDefined();
    expect(map.web?.name).toBe("web");
  });

  it("web adapter does not require env vars and is always enabled", () => {
    const reg = new AdapterRegistry();
    const entry = reg.get("web");
    expect(entry?.enabled).toBe(true);
    expect(entry?.status).toBe("connected");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `bun run test:unit -- services/chat/adapter-registry`
Expected: FAIL（web 不在 SUPPORTED）

- [ ] **Step 3: 修改 adapter-registry.ts**

定位 `SUPPORTED`：

```ts
const SUPPORTED = ["telegram", "lark"] as const;
```

改为：

```ts
const SUPPORTED = ["telegram", "lark", "web"] as const;
```

在 `list()` 方法末尾追加 web 条目（在 `.filter(Boolean)` 之前）。把现有 `SUPPORTED.map(...)` 改造，先处理 IM adapters，再追加 web：

```ts
  list(): AdapterEntry[] {
    const { statusState } = this;
    const creds = configStore.get("adapters", {});
    const imEntries = (["telegram", "lark"] as const).map((slug) => {
      const meta = getAdapter(slug);
      if (!meta) {
        return null;
      }
      const saved = creds[slug];
      const tracked = statusState[slug] ?? { status: "disconnected" as const };
      return {
        description: meta.description,
        enabled: saved?.enabled ?? false,
        env: saved?.env ?? {},
        errorMessage: tracked.errorMessage,
        name: meta.name,
        slug,
        status: tracked.status,
      };
    }).filter(Boolean) as AdapterEntry[];

    return [
      ...imEntries,
      {
        description: "桌面端本地会话",
        enabled: true,
        env: {},
        name: "Desktop",
        slug: "web",
        status: "connected",
      },
    ];
  }
```

修改 `buildAdapterMap()`，让 web 始终注入：

```ts
  async buildAdapterMap(): Promise<Record<string, Adapter>> {
    const map: Record<string, Adapter> = { web: createLocalWebAdapter() };
    const creds = configStore.get("adapters", {});
    for (const slug of ["telegram", "lark"] as const) {
      const saved = creds[slug];
      if (!saved?.enabled) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: sequential needed
      const adapter = await this.loadAdapter(slug, saved.env);
      if (adapter) {
        map[slug] = adapter;
      }
    }
    return map;
  }
```

在文件顶部 import：

```ts
import { createLocalWebAdapter } from "@/services/web";
```

注意：`SUPPORTED` 常量如果其他地方有依赖引用，保留其定义但 `list`/`buildAdapterMap` 不再用它做遍历。检查无其他引用后可保留或删除——若有 lint 报未使用则删除。若无其他引用则删除 `SUPPORTED` 常量。

- [ ] **Step 4: 运行测试，确认通过**

Run: `bun run test:unit -- services/chat/adapter-registry`
Expected: PASS

- [ ] **Step 5: 全套单测防回归**

Run: `bun run test:unit`
Expected: 全绿

- [ ] **Step 6: 类型检查 + lint**

Run: `bun run check-types && bun run fix`
Expected: 无错误

- [ ] **Step 7: 提交**

```bash
git add src/services/chat/adapter-registry.ts src/tests/unit/services/chat/adapter-registry.test.ts
git commit -m "feat(chat): register web adapter in AdapterRegistry"
```

---

## Task 5: oRPC web.getEndpoint 端点

**Files:**
- Create: `src/ipc/web/handlers.ts`、`src/ipc/web/index.ts`
- Modify: `src/ipc/router.ts`、`src/actions/web.ts`（新增）
- Test: `src/tests/unit/ipc/web-endpoint.test.ts`（新增）

**Interfaces:**
- Consumes: 全局 `(globalThis as any).__webServer`（由 Task 6 bootstrap 写入），含 `{ port: number }`
- Produces: `getEndpoint()` 返回 `"http://127.0.0.1:{port}/api/chat"`；`ipc.client.web.getEndpoint()`

- [ ] **Step 1: 写失败测试**

```ts
// src/tests/unit/ipc/web-endpoint.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEndpoint } from "@/ipc/web/handlers";

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__webServer;
});

describe("web.getEndpoint", () => {
  it("returns http://127.0.0.1:{port}/api/chat when web server is ready", async () => {
    (globalThis as Record<string, unknown>).__webServer = { port: 53721 };
    const endpoint = await getEndpoint.handler({});
    expect(endpoint).toBe("http://127.0.0.1:53721/api/chat");
  });

  it("throws when web server not initialized", async () => {
    await expect(getEndpoint.handler({})).rejects.toThrow(
      /Web HTTP server not ready/
    );
  });
});
```

注意：oRPC handler 的实际调用签名以 `@orpc/server` 为准，`getEndpoint.handler({})` 是简化写法。若 oRPC 测试惯例不同，按现有 `events-subscription.test.ts` 的调用方式调整（直接调 handler 函数对象）。具体看 `src/tests/unit/ipc/events-subscription.test.ts` 的现有风格。

- [ ] **Step 2: 运行测试，确认失败**

Run: `bun run test:unit -- ipc/web-endpoint`
Expected: FAIL

- [ ] **Step 3: 实现 handlers**

```ts
// src/ipc/web/handlers.ts
import { os } from "@orpc/server";

export const getEndpoint = os.handler(() => {
  const webServer = (
    globalThis as unknown as { __webServer?: { port: number } }
  ).__webServer;
  if (!webServer) {
    throw new Error("Web HTTP server not ready");
  }
  return `http://127.0.0.1:${webServer.port}/api/chat`;
});
```

```ts
// src/ipc/web/index.ts
export const web = { getEndpoint };
```

修改 router.ts：

```ts
import { web } from "./web";
// ...
export const router = {
  acp,
  app,
  channel,
  conversation,
  events,
  shell,
  theme,
  web,
  window,
};
```

新增 actions：

```ts
// src/actions/web.ts
import { ipc } from "@/ipc/manager";

export function getEndpoint(): Promise<string> {
  return ipc.client.web.getEndpoint() as Promise<string>;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `bun run test:unit -- ipc/web-endpoint`
Expected: PASS

- [ ] **Step 5: 类型检查**

Run: `bun run check-types`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add src/ipc/web/ src/ipc/router.ts src/actions/web.ts src/tests/unit/ipc/web-endpoint.test.ts
git commit -m "feat(ipc): add web.getEndpoint oRPC endpoint"
```

---

## Task 6: bootstrap 集成 — 启动 web HTTP server

**Files:**
- Modify: `src/services/bootstrap.ts`
- Test: `src/tests/unit/services/bootstrap.test.ts`（新增）

**Interfaces:**
- Consumes: `createWebHttpServer`（Task 3）、`ChatService.getChat()`（新增 getter）
- Produces: main 启动后 `(globalThis as any).__webServer = { port, close }`

- [ ] **Step 6a 先决：ChatService.getChat 已是 public**

确认 `src/services/chat/chat-service.ts:33` 已有 `getChat(): Chat | null`，无需新增。直接用。

- [ ] **Step 1: 写失败测试**

```ts
// src/tests/unit/services/bootstrap.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/persistence", async () => {
  const { createMemoryDatabase, makePersistenceMock } = await import(
    "@/tests/unit/helpers/persistence-mock"
  );
  const db = createMemoryDatabase();
  return makePersistenceMock(db, { acpServers: [], adapters: {} });
});

vi.mock("@chat-adapter/state-memory", () => ({
  createMemoryState: () => ({}) as unknown,
}));

describe("bootstrapServices", () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__webServer;
  });

  it("starts web HTTP server and exposes __webServer with port > 0", async () => {
    const { bootstrapServices } = await import("@/services/bootstrap");
    const services = await bootstrapServices();
    const webServer = (
      globalThis as unknown as { __webServer?: { port: number } }
    ).__webServer;
    expect(webServer).toBeDefined();
    expect(webServer?.port).toBeGreaterThan(0);
    await services.acpService.disconnect(
      services.acpService.getServers()[0]?.id ?? ""
    );
  });
});
```

注意：`beforeEach` 清掉 `__webServer` 防泄漏。bootstrap 内部会启动 lark/telegram 适配器（依赖 env），未配置时 adapter map 只含 web，ChatService 初始化应能成功。

- [ ] **Step 2: 运行测试，确认失败**

Run: `bun run test:unit -- services/bootstrap`
Expected: FAIL（`__webServer` 未定义）

- [ ] **Step 3: 修改 bootstrap.ts**

在文件顶部 import：

```ts
import { createWebHttpServer } from "@/services/web";
```

定位现有 `await chatService.initialize();`（约 line 156），在其之后、`Promise.all` 自动连接 ACP servers 之前插入：

```ts
  // 启动 web HTTP server，供桌面端 useChat 调用
  const chat = chatService.getChat();
  if (chat) {
    try {
      const webServer = await createWebHttpServer(chat);
      (globalThis as unknown as { __webServer?: unknown }).__webServer =
        webServer;
      console.log(`[bootstrap] Web HTTP server listening on 127.0.0.1:${webServer.port}`);
    } catch (err) {
      console.error(
        "[bootstrap] Web HTTP server failed:",
        err instanceof Error ? err.stack : err
      );
      // 不阻断主流程，chat 仍可用，只是桌面端发消息会失败
    }
  }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `bun run test:unit -- services/bootstrap`
Expected: PASS

- [ ] **Step 5: 全套单测**

Run: `bun run test:unit`
Expected: 全绿（注意观察 chat-service.test.ts 是否受影响，web adapter 注入 chatService 后 processMessage 流程可能变更）

- [ ] **Step 6: 类型检查 + lint**

Run: `bun run check-types && bun run fix`
Expected: 无错误

- [ ] **Step 7: 提交**

```bash
git add src/services/bootstrap.ts src/tests/unit/services/bootstrap.test.ts
git commit -m "feat(bootstrap): start web HTTP server after ChatService init"
```

---

## Task 7: useWebEndpoint hook

**Files:**
- Create: `src/hooks/use-web-endpoint.ts`
- Test: `src/tests/unit/hooks/use-web-endpoint.test.ts`

**Interfaces:**
- Consumes: `getEndpoint()`（来自 `@/actions/web`，Task 5）
- Produces: `useWebEndpoint(): UseQueryResult<string | undefined>`，`staleTime: Infinity`

- [ ] **Step 1: 写失败测试**

```ts
// src/tests/unit/hooks/use-web-endpoint.test.ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ipc/manager", () => ({
  ipc: {
    client: {
      web: {
        getEndpoint: vi.fn(),
      },
    },
  },
}));

import { ipc } from "@/ipc/manager";
import { useWebEndpoint } from "@/hooks/use-web-endpoint";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useWebEndpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns endpoint string from ipc.client.web.getEndpoint", async () => {
    (ipc.client.web.getEndpoint as ReturnType<typeof vi.fn>).mockResolvedValue(
      "http://127.0.0.1:53721/api/chat"
    );
    const { result } = renderHook(() => useWebEndpoint(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toBe("http://127.0.0.1:53721/api/chat");
  });
});
```

注意：jsx 在 .ts 文件中可能不被解析。把测试文件命名 `.tsx`：`src/tests/unit/hooks/use-web-endpoint.test.tsx`，并使用 import React 或依赖 jsx runtime。检查现有 hook 单测是否带 jsx；若 .ts 文件已有 jsx 用例则按其惯例。

- [ ] **Step 2: 运行测试，确认失败**

Run: `bun run test:unit -- use-web-endpoint`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// src/hooks/use-web-endpoint.ts
import { useQuery } from "@tanstack/react-query";
import { getEndpoint } from "@/actions/web";

export function useWebEndpoint() {
  return useQuery({
    queryFn: () => getEndpoint(),
    queryKey: ["webEndpoint"],
    staleTime: Number.POSITIVE_INFINITY,
  });
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `bun run test:unit -- use-web-endpoint`
Expected: PASS

- [ ] **Step 5: 类型检查**

Run: `bun run check-types`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add src/hooks/use-web-endpoint.ts src/tests/unit/hooks/use-web-endpoint.test.tsx
git commit -m "feat(hooks): add useWebEndpoint React Query hook"
```

---

## Task 8: WebChat 组件

**Files:**
- Create: `src/components/conversation/web-chat.tsx`
- Test: `src/tests/unit/components/web-chat.test.tsx`

**Interfaces:**
- Consumes: `useWebEndpoint`（Task 7）、`@chat-adapter/web/react` 的 `useChat`、ai-elements `<Conversation>`/`<Message>`/`<MessageContent>`/`<MessageResponse>`/`<Shimmer>`/`<PromptInput>`/`<PromptInputTextarea>`/`<PromptInputSubmit>`
- Produces: `WebChat({ threadId, initialMessages })` React 组件

- [ ] **Step 1: 写失败测试**

```tsx
// src/tests/unit/components/web-chat.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";

vi.mock("@chat-adapter/web/react", () => ({
  useChat: vi.fn(),
}));

vi.mock("@/hooks/use-web-endpoint", () => ({
  useWebEndpoint: () => ({
    data: "http://127.0.0.1:53721/api/chat",
  }),
}));

import { useChat } from "@chat-adapter/web/react";
import { WebChat } from "@/components/conversation/web-chat";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("WebChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders text parts of messages via MessageResponse", () => {
    (useChat as ReturnType<typeof vi.fn>).mockReturnValue({
      error: null,
      messages: [
        {
          id: "m1",
          parts: [{ text: "hello world", type: "text" }],
          role: "user",
        },
      ] as unknown as UIMessage[],
      sendMessage: vi.fn(),
      status: "ready",
      stop: vi.fn(),
    });
    render(
      <WebChat initialMessages={[]} threadId="web:local:abc" />,
      { wrapper }
    );
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("shows Shimmer when busy and last message is not assistant", () => {
    (useChat as ReturnType<typeof vi.fn>).mockReturnValue({
      error: null,
      messages: [
        { id: "m1", parts: [{ text: "q", type: "text" }], role: "user" },
      ] as unknown as UIMessage[],
      sendMessage: vi.fn(),
      status: "submitted",
      stop: vi.fn(),
    });
    render(
      <WebChat initialMessages={[]} threadId="web:local:abc" />,
      { wrapper }
    );
    expect(screen.getByText("正在思考...")).toBeInTheDocument();
  });

  it("shows error message in destructive style when error set", () => {
    (useChat as ReturnType<typeof vi.fn>).mockReturnValue({
      error: new Error("boom"),
      messages: [] as UIMessage[],
      sendMessage: vi.fn(),
      status: "ready",
      stop: vi.fn(),
    });
    render(
      <WebChat initialMessages={[]} threadId="web:local:abc" />,
      { wrapper }
    );
    expect(screen.getByText("boom")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `bun run test:unit -- components/web-chat`
Expected: FAIL

- [ ] **Step 3: 实现**

```tsx
// src/components/conversation/web-chat.tsx
import { useChat } from "@chat-adapter/web/react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useWebEndpoint } from "@/hooks/use-web-endpoint";
import type { UIMessage } from "ai";
import { useState } from "react";

interface Props {
  threadId: string;
  initialMessages: UIMessage[];
}

export function WebChat({ threadId, initialMessages }: Props) {
  const { data: endpoint } = useWebEndpoint();
  const { messages, sendMessage, status, error, stop } = useChat({
    api: endpoint ?? "/api/chat",
    threadId,
    messages: initialMessages,
  });

  const isBusy = status === "submitted" || status === "streaming";
  const [input, setInput] = useState("");

  const last = messages[messages.length - 1];
  const showShimmer = isBusy && last?.role !== "assistant";

  return (
    <Conversation>
      <ConversationContent>
        {messages.map((m) => (
          <Message from={m.role} key={m.id}>
            <MessageContent>
              {m.parts.map((p, i) =>
                p.type === "text" ? (
                  <MessageResponse key={i}>{p.text}</MessageResponse>
                ) : null
              )}
            </MessageContent>
          </Message>
        ))}
        {showShimmer ? (
          <Message from="assistant">
            <MessageContent>
              <Shimmer>正在思考...</Shimmer>
            </MessageContent>
          </Message>
        ) : null}
        {error ? (
          <Message from="assistant">
            <MessageContent>
              <div className="text-destructive text-sm">{error.message}</div>
            </MessageContent>
          </Message>
        ) : null}
      </ConversationContent>
      <ConversationScrollButton />
      <PromptInput
        onSubmit={({ text }) => {
          if (text.trim() && !isBusy) {
            void sendMessage({ text });
            setInput("");
          }
        }}
      >
        <PromptInputTextarea
          disabled={isBusy || !endpoint}
          onChange={(e) => setInput(e.target.value)}
          value={input}
        />
        <PromptInputSubmit
          disabled={isBusy || !endpoint || !input.trim()}
          onClick={isBusy ? () => stop() : undefined}
        >
          {isBusy ? "停止" : "发送"}
        </PromptInputSubmit>
      </PromptInput>
    </Conversation>
  );
}
```

注意：`PromptInput.onSubmit` 的签名是 `(message: PromptInputMessage, event) => void`，`PromptInputMessage` 含 `{ text: string; files: FileUIPart[] }`。见 prompt-input.tsx:485-512。

`PromptInputSubmit` 是 `InputGroupButton` 的封装，其 `onClick` 透传；`disabled` 透传。见 prompt-input.tsx:1207-1221。

- [ ] **Step 4: 运行测试，确认通过**

Run: `bun run test:unit -- components/web-chat`
Expected: PASS

- [ ] **Step 5: 类型检查 + lint**

Run: `bun run check-types && bun run fix`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add src/components/conversation/web-chat.tsx src/tests/unit/components/web-chat.test.tsx
git commit -m "feat(conversation): add WebChat component with useChat + PromptInput"
```

---

## Task 9: IMChat 组件

**Files:**
- Create: `src/components/conversation/im-chat.tsx`
- Test: `src/tests/unit/components/im-chat.test.tsx`

**Interfaces:**
- Consumes: ai-elements `<Conversation>`/`<Message>`/`<MessageContent>`/`<MessageResponse>`
- Produces: `IMChat({ initialMessages, adapterName })` 只读渲染

- [ ] **Step 1: 写失败测试**

```tsx
// src/tests/unit/components/im-chat.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { IMChat } from "@/components/conversation/im-chat";

describe("IMChat", () => {
  it("shows empty state when no messages", () => {
    render(<IMChat adapterName="telegram" initialMessages={[]} />);
    expect(screen.getByText(/此 telegram 会话暂无消息/)).toBeInTheDocument();
  });

  it("renders text parts via MessageResponse and has no input", () => {
    const messages: UIMessage[] = [
      {
        id: "m1",
        parts: [{ text: "hi from telegram", type: "text" }],
        role: "user",
      },
    ];
    const { container } = render(
      <IMChat adapterName="telegram" initialMessages={messages} />
    );
    expect(screen.getByText("hi from telegram")).toBeInTheDocument();
    // 不存在 textarea / form input
    expect(container.querySelector("textarea")).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `bun run test:unit -- components/im-chat`
Expected: FAIL

- [ ] **Step 3: 实现**

```tsx
// src/components/conversation/im-chat.tsx
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import type { UIMessage } from "ai";

interface Props {
  initialMessages: UIMessage[];
  adapterName: string;
}

export function IMChat({ initialMessages, adapterName }: Props) {
  return (
    <Conversation>
      <ConversationContent>
        {initialMessages.length === 0 ? (
          <div className="flex size-full items-center justify-center text-muted-foreground text-sm">
            此 {adapterName} 会话暂无消息
          </div>
        ) : (
          initialMessages.map((m) => (
            <Message from={m.role} key={m.id}>
              <MessageContent>
                {m.parts.map((p, i) =>
                  p.type === "text" ? (
                    <MessageResponse key={i}>{p.text}</MessageResponse>
                  ) : null
                )}
              </MessageContent>
            </Message>
          ))
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `bun run test:unit -- components/im-chat`
Expected: PASS

- [ ] **Step 5: 类型检查**

Run: `bun run check-types`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add src/components/conversation/im-chat.tsx src/tests/unit/components/im-chat.test.tsx
git commit -m "feat(conversation): add IMChat read-only component"
```

---

## Task 10: MessagePanel 重写 — 分发

**Files:**
- Modify: `src/components/conversation/message-panel.tsx`
- Test: `src/tests/unit/components/message-panel.test.tsx`（新增）

**Interfaces:**
- Consumes: `useConversation`、`useMessages`（来自 `@/hooks/use-conversations`）、`toUIMessages`（Task 1）、`WebChat`（Task 8）、`IMChat`（Task 9）
- Produces: `MessagePanel({ conversationId })` 按 `conv.adapter` 分发

- [ ] **Step 1: 写失败测试**

```tsx
// src/tests/unit/components/message-panel.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-conversations", () => ({
  useConversation: vi.fn(),
  useMessages: vi.fn(),
}));

vi.mock("@/components/conversation/web-chat", () => ({
  WebChat: () => <div data-testid="web-chat" />,
}));

vi.mock("@/components/conversation/im-chat", () => ({
  IMChat: () => <div data-testid="im-chat" />,
}));

import { useConversation, useMessages } from "@/hooks/use-conversations";
import { MessagePanel } from "@/components/conversation/message-panel";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("MessagePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders WebChat when adapter is 'web'", () => {
    (useConversation as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { adapter: "web", id: "web:local:a" },
    });
    (useMessages as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
    });
    render(<MessagePanel conversationId="web:local:a" />, { wrapper });
    expect(screen.getByTestId("web-chat")).toBeInTheDocument();
  });

  it("renders IMChat for non-web adapter", () => {
    (useConversation as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { adapter: "telegram", id: "t-1" },
    });
    (useMessages as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
    });
    render(<MessagePanel conversationId="t-1" />, { wrapper });
    expect(screen.getByTestId("im-chat")).toBeInTheDocument();
  });

  it("shows loading state when conversation not loaded", () => {
    (useConversation as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
    });
    (useMessages as ReturnType<typeof vi.fn>).mockReturnValue({
      isLoading: true,
    });
    render(<MessagePanel conversationId="t-1" />, { wrapper });
    expect(screen.getByText(/加载中/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `bun run test:unit -- components/message-panel`
Expected: FAIL（现有实现不 dispatch）

- [ ] **Step 3: 重写 message-panel.tsx**

```tsx
// src/components/conversation/message-panel.tsx
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { useConversation, useMessages } from "@/hooks/use-conversations";
import { IMChat } from "./im-chat";
import { WebChat } from "./web-chat";
import { toUIMessages } from "@/utils/transcript-to-ui-messages";

interface Props {
  conversationId: string;
}

export function MessagePanel({ conversationId }: Props) {
  const { data: conv } = useConversation(conversationId);
  const { data: transcripts, isLoading } = useMessages(conversationId);

  const initialMessages = useMemo(
    () => toUIMessages(transcripts ?? []),
    [transcripts]
  );

  if (isLoading || !conv) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载中...
      </div>
    );
  }

  if (conv.adapter === "web") {
    return (
      <WebChat
        initialMessages={initialMessages}
        key={conversationId}
        threadId={conversationId}
      />
    );
  }

  return (
    <IMChat
      adapterName={conv.adapter}
      initialMessages={initialMessages}
      key={conversationId}
    />
  );
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `bun run test:unit -- components/message-panel`
Expected: PASS

- [ ] **Step 5: 类型检查 + lint**

Run: `bun run check-types && bun run fix`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add src/components/conversation/message-panel.tsx src/tests/unit/components/message-panel.test.tsx
git commit -m "refactor(conversation): dispatch MessagePanel by adapter source"
```

---

## Task 11: 会话列新建按钮

**Files:**
- Modify: `src/components/conversation/conversation-list.tsx`
- Test: `src/tests/unit/components/conversation-list.test.tsx`（新增）

**Interfaces:**
- Consumes: TanStack Router `useNavigate`、`useQueryClient`、`nanoid`
- Produces: 点击按钮生成 `web:local:{nanoid()}` threadId 并导航到 `/conversation/$id`

- [ ] **Step 1: 写失败测试**

```tsx
// src/tests/unit/components/conversation-list.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/hooks/use-conversations", () => ({
  useConversations: () => ({ data: [], isLoading: false }),
}));

import { ConversationList } from "@/components/conversation/conversation-list";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("ConversationList", () => {
  it("renders new conversation button", () => {
    render(<ConversationList />, { wrapper });
    expect(screen.getByRole("button", { name: /新建会话/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `bun run test:unit -- components/conversation-list`
Expected: FAIL

- [ ] **Step 3: 修改 conversation-list.tsx**

```tsx
// src/components/conversation/conversation-list.tsx
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, PlusIcon } from "lucide-react";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversations } from "@/hooks/use-conversations";
import { ConversationItem } from "./conversation-item";

export function ConversationList() {
  const { data: conversations, isLoading } = useConversations();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function createLocalConversation() {
    const threadId = `web:local:${nanoid()}`;
    await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    navigate({ params: { id: threadId }, to: "/conversation/$id" });
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-2">
        <Button
          className="w-full"
          onClick={createLocalConversation}
          variant="outline"
        >
          <PlusIcon className="h-4 w-4" />
          新建会话
        </Button>
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : null}
        {conversations?.map((c) => (
          <ConversationItem conversation={c} key={c.id} />
        ))}
        {conversations?.length === 0 && !isLoading && (
          <p className="py-8 text-center text-muted-foreground text-sm">
            暂无对话
          </p>
        )}
      </div>
    </ScrollArea>
  );
}
```

注意：确认 `src/components/ui/button.tsx` 存在（shadcn 标配，已存在）。

- [ ] **Step 4: 运行测试，确认通过**

Run: `bun run test:unit -- components/conversation-list`
Expected: PASS

- [ ] **Step 5: 类型检查 + lint**

Run: `bun run check-types && bun run fix`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add src/components/conversation/conversation-list.tsx src/tests/unit/components/conversation-list.test.tsx
git commit -m "feat(conversation): add new local conversation button to list"
```

---

## Task 12: CSP 调整

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 读取 index.html 确认当前 CSP**

Run: `cat index.html | grep -i content-security`
Expected: `script-src 'self';`

- [ ] **Step 2: 修改 CSP**

把现有 `<meta content="script-src 'self';" http-equiv="Content-Security-Policy">` 改为：

```html
<meta content="script-src 'self'; connect-src 'self' http://127.0.0.1:*;" http-equiv="Content-Security-Policy">
```

- [ ] **Step 3: 类型检查（不会有 TS 报错，仅 HTML）**

Run: `bun run check-types`
Expected: 无错误

- [ ] **Step 4: 启动应用验证无 CSP 违规**

Run: `bun run start`（手动启动 Electron，开发者工具 Console 不应有 CSP 违规报告；本地测试时无后端可达即可）

- [ ] **Step 5: 提交**

```bash
git add index.html
git commit -m "chore(security): allow connect-src to local web adapter in CSP"
```

---

## Task 13: 删除废弃流式代码

**Files:**
- Delete: `src/hooks/use-streaming-message.ts`、`src/hooks/use-event-stream.ts`、`src/utils/message-merge.ts`
- Delete tests: `src/tests/unit/hooks/use-streaming-message.test.ts`、`src/tests/unit/utils/message-merge.test.ts`、`src/tests/unit/ipc/events-subscription.test.ts`
- Modify: `src/ipc/events/handlers.ts`（移除 `subscribe`、`createEventIterator`、`__testEmit` 如有引用）、`src/ipc/events/index.ts`

**Interfaces:**
- Consumes: Task 10 已让 message-panel 不再 import 这些文件
- Produces: 无引用残留，全套单测绿

- [ ] **Step 1: 先确认无残留引用**

Run: `rg "use-streaming-message|use-event-stream|message-merge|events\.subscribe|createEventIterator" src --type ts -l`
Expected: 仅剩待删除文件 + events/handlers.ts + events/index.ts

如果有非删除目标的引用，先修复（impacts MessagePanel / list 路由等）。若 Task 10/4 已断引用，这里应为空。

- [ ] **Step 2: 删除文件**

```bash
rm src/hooks/use-streaming-message.ts \
   src/hooks/use-event-stream.ts \
   src/utils/message-merge.ts \
   src/tests/unit/hooks/use-streaming-message.test.ts \
   src/tests/unit/utils/message-merge.test.ts \
   src/tests/unit/ipc/events-subscription.test.ts
```

- [ ] **Step 3: 修改 events/handlers.ts**

移除 `subscribe`、`createEventIterator`、`eventPublisher`（若不再被使用），保留 `getRecentEvents` 与 `registerEventCollector`。新文件应类似：

```ts
// src/ipc/events/handlers.ts
import { os } from "@orpc/server";
import type { AppEvent } from "./event-types";

const recentEvents: AppEvent[] = [];
const MAX_EVENTS = 100;

interface EventBridgeLike {
  onEvent: (handler: (event: unknown) => void) => () => void;
}

export function registerEventCollector(): void {
  try {
    const services = (globalThis as Record<string, unknown>).__services as
      | { eventBridge: EventBridgeLike }
      | undefined;
    if (services?.eventBridge) {
      services.eventBridge.onEvent((event: unknown) => {
        recentEvents.push(event as AppEvent);
        if (recentEvents.length > MAX_EVENTS) {
          recentEvents.shift();
        }
      });
    }
  } catch {
    console.log(
      "[events] Event collector registration skipped (services not ready)"
    );
  }
}

export const getRecentEvents = os.handler(() =>
  recentEvents.splice(0, recentEvents.length)
);
```

注意：`EventPublisher` import 删除。`registerEventCollector` 现在只维护 recentEvents ring buffer，不再 publish。确认 `event-bridge.ts` 是否还依赖 publish——若 EventBridge 仍 emit 给别处（如其它订阅者），保留 eventPublisher。检查 `event-bridge.ts` 是否被其它模块用 publish。本任务先只移除 `subscribe` 端点与 `useEventStream` 链路，`eventPublisher` 如有其他引用则保留。

更安全的做法：保留 `eventPublisher` 与 `createEventIterator`（不导出 `subscribe`），让 `registerEventCollector` 继续把 event push 到 publisher（备将来恢复）。仅删除 `subscribe` 端点导出与对应单测。

最终改动：

```ts
// src/ipc/events/handlers.ts（保留 EventPublisher 但不再导出 subscribe 端点）
import { os } from "@orpc/server";
import { EventPublisher } from "@orpc/shared";
import type { AppEvent } from "./event-types";

const recentEvents: AppEvent[] = [];
const MAX_EVENTS = 100;

const eventPublisher = new EventPublisher<{ event: AppEvent }>();

interface EventBridgeLike {
  onEvent: (handler: (event: unknown) => void) => () => void;
}

export function registerEventCollector(): void {
  try {
    const services = (globalThis as Record<string, unknown>).__services as
      | { eventBridge: EventBridgeLike }
      | undefined;
    if (services?.eventBridge) {
      services.eventBridge.onEvent((event: unknown) => {
        recentEvents.push(event as AppEvent);
        if (recentEvents.length > MAX_EVENTS) {
          recentEvents.shift();
        }
        eventPublisher.publish("event", event as AppEvent);
      });
    }
  } catch {
    console.log(
      "[events] Event collector registration skipped (services not ready)"
    );
  }
}

export const getRecentEvents = os.handler(() =>
  recentEvents.splice(0, recentEvents.length)
);
```

修改 `src/ipc/events/index.ts`：

```ts
/** biome-ignore-all lint/performance/noBarrelFile: intentional public API surface for events domain */
import { getRecentEvents } from "./handlers";

export { registerEventCollector } from "./handlers";
export const events = { getRecentEvents };
```

（移除 `subscribe`）

- [ ] **Step 4: 类型检查 + lint**

Run: `bun run check-types && bun run fix`
Expected: 无错误，无残留导入

- [ ] **Step 5: 全套单测**

Run: `bun run test:unit`
Expected: 全绿

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "refactor(events): remove streaming hooks, message-merge, and events.subscribe endpoint"
```

---

## Task 14: E2E 端到端流式

**Files:**
- Create: `src/tests/e2e/web-chat-flow.test.ts`

**Interfaces:**
- Consumes: Task 1-13 全部完成、`.env.dev` 配置真实 ACP server
- Produces: Playwright 测试覆盖"新建→发送→流式→持久化→重启"

- [ ] **Step 1: 写测试**

```ts
// src/tests/e2e/web-chat-flow.test.ts
import {
  type ElectronApplication,
  _electron as electron,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { findLatestBuild, parseElectronApp } from "electron-playwright-helpers";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let electronApp: ElectronApplication;

test.beforeAll(async () => {
  const envPath = join(process.cwd(), ".env.dev");
  if (!existsSync(envPath)) {
    console.warn("web-chat-flow: .env.dev not found, skipping");
    return;
  }
  const content = readFileSync(envPath, "utf-8");
  if (!content.includes("ACP_SERVER_PI_COMMAND")) {
    console.warn("web-chat-flow: ACP server not configured, skipping");
    return;
  }

  const latestBuild = findLatestBuild();
  const appInfo = parseElectronApp(latestBuild);
  process.env.CI = "e2e";
  electronApp = await electron.launch({ args: [appInfo.main] });
});

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close();
  }
});

test("web chat: send message and persist reply", async () => {
  if (!electronApp) {
    test.skip();
    return;
  }
  test.setTimeout(60_000);

  const page: Page = await electronApp.firstWindow();

  // 等会话列表加载
  await page.waitForSelector("text=新建会话");

  // 新建本地会话
  await page.getByRole("button", { name: /新建会话/ }).click();

  // 等输入框可见
  const textarea = page.locator("textarea").first();
  await textarea.waitFor({ state: "visible" });
  await textarea.fill("hello from e2e");

  // 发送
  await page.getByRole("button", { name: /发送/ }).click();

  // 等待 assistant 气泡出现（流式或最终）
  // ip elements Message 的 class 包含 is-assistant
  const assistantBubble = page
    .locator(".is-assistant")
    .first();
  await expect(assistantBubble).toBeVisible({ timeout: 30_000 });

  // 等内容非空
  await expect(async () => {
    const text = await assistantBubble.textContent();
    expect(text?.trim().length ?? 0).toBeGreaterThan(0);
  }).toPass({ timeout: 30_000 });
});
```

- [ ] **Step 2: 准备 .env.dev（开发者本地）**

确认 `.env.dev` 含：

```
AGENTLINK_DEV=1
ACP_SERVER_PI_COMMAND=<绝对路径或可执行命令>
ACP_SERVER_PI_ARGS=<参数>
# 可选：LARK_APP_ID / LARK_APP_SECRET
```

CI 需在 `.github/workflows/testing.yaml` 的 `test-e2e` job 增加 ACP server 安装步骤（如 `uv tool install <pi-agent-pkg>` 并写入 `.env.dev`）。此 CI 改动另记 issue 或在本任务附 commit。

- [ ] **Step 3: 运行 E2E（本地）**

Run: `bun run test:e2e -- web-chat-flow`
Expected: PASS（若未配置 .env.dev，自动 skip）

- [ ] **Step 4: 类型检查**

Run: `bun run check-types`
Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add src/tests/e2e/web-chat-flow.test.ts
git commit -m "test(e2e): add web-chat end-to-end flow with real ACP server"
```

---

## 收尾验证

- [ ] **全套单测**

Run: `bun run test:unit`
Expected: 全绿

- [ ] **类型检查 + lint**

Run: `bun run check-types && bun run fix`
Expected: 无错误

- [ ] **E2E（本地有 .env.dev 配置 ACP server）**

Run: `bun run test:e2e`
Expected: 全绿

- [ ] **手动端到端验证**

按 spec 第 8 节 11 步逐项验证，特别关注：
1. 控制台无 `[bootstrap] Web HTTP server failed` 报错
2. 新建会话 → 输入 → 流式增长 → 停止按钮可中断
3. 会话切换 → 历史正确显示
4. IM 会话只读，无输入框
5. 重启后 web 会话历史仍在
6. ACP 未连接时发消息，错误提示可见
7. 开发者工具 Console 无 CSP 违规

- [ ] **最终提交（如有 lint 修正）**

```bash
git add -A
git commit --allow-empty -m "chore: verify desktop web adapter integration"
```

---

## Self-Review 结果

**1. Spec 覆盖**：
- §3 Main 进程改造 → Task 2/3/4/5/6 ✓
- §4 Renderer 改造 → Task 7/8/9/10/11 ✓
- §2 传输通道分层 → Task 3(server) + Task 5(oRPC) ✓
- §5 旧代码清理 → Task 13 ✓
- §6 CSP → Task 12 ✓
- §7 测试策略 → 各 Task 1-13 含单测 + Task 14 E2E ✓
- §1.4 web adapter 接入 → Task 2 ✓

**2. 占位符扫描**：无 TBD/TODO；代码示例完整。

**3. 类型一致性**：
- `toUIMessages` 返回 `UIMessage[]`，被 Task 8/9/10 一致使用 ✓
- `createLocalWebAdapter` 返回 `WebAdapter`，被 Task 4 buildAdapterMap 使用 ✓
- `createWebHttpServer` 返回 `{ port, close }`，被 Task 6 写入 globalThis ✓
- `useWebEndpoint` 返回 query，被 Task 8 使用 ✓
- `getEndpoint` 返回 string，被 Task 7 action 调用 ✓

无遗漏。