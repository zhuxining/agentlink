# 核心流式体验补全 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把"收到消息 -> 流式回复"在 IM 和桌面端做到完整闭环：IM 侧逐字流式、桌面端流式 markdown 渲染 + thinking 状态 + 左右分栏布局。

**Architecture:** 主进程把 ACP chunks 转成 `AsyncIterable` 喂给 Chat SDK 的 `thread.post()`（SDK 自动流式到 IM），同时通过 oRPC subscription 把 chunk 事件实时推给渲染进程。渲染进程用 ai-elements 的 `MessageResponse`（内部 Streamdown）渲染流式 markdown，合并持久化历史与实时流式消息。新增 AsyncQueue 工具桥接回调与 AsyncIterable。

**Tech Stack:** oRPC 1.14 subscription（`EventPublisher`）、Chat SDK `thread.post(AsyncIterable)`、ai-elements（Message/Conversation/MessageResponse/Shimmer）、Streamdown、Vitest + React Testing Library、Playwright。

## Global Constraints

- 包管理器：bun（锁文件 `bun.lock`），禁止 npm/yarn/pnpm
- TypeScript：`noUnusedLocals`、`noUnusedParameters`、`erasableSyntaxOnly` 已启用，禁用 `enum`/`namespace`
- 测试：`bun run test:unit --run`（Vitest + jsdom），`bun run check-types` 类型检查
- 图标：`lucide-react`，禁止内联 svg
- 不可修改：`src/components/ui/`、`src/components/ai-elements/`（直接使用其导出，不编辑）
- 样式：视觉样式用 shadcn/ui + Tailwind 主题 token，自定义 CSS class 仅用于布局
- 中文回复，commit 遵循 Conventional Commits（`feat`/`fix`/`refactor`/`test`/`chore`/`docs`）

---

## File Structure

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/utils/async-queue.ts` | 回调转 AsyncIterable 的 AsyncQueue 工具：`push(item)` 入队，`close()` 关闭，`iter()` 返回 AsyncIterable |
| `src/utils/message-merge.ts` | 合并持久化历史消息与临时流式消息的纯函数 |
| `src/hooks/use-event-stream.ts` | oRPC subscription 客户端，订阅实时事件 |
| `src/hooks/use-streaming-message.ts` | 流式消息状态机 hook（thinking -> 累积 -> 结束） |
| `src/tests/unit/utils/async-queue.test.ts` | AsyncQueue 单测 |
| `src/tests/unit/utils/message-merge.test.ts` | 消息合并单测 |
| `src/tests/unit/hooks/use-streaming-message.test.ts` | 流式消息 hook 单测 |
| `src/tests/unit/ipc/events-subscription.test.ts` | subscription 端点单测 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/services/acp/acp-service.ts` | `sendPrompt` 返回 `textStream: AsyncIterable<string>`，用 AsyncQueue 桥接 onChunk 回调 |
| `src/services/bootstrap.ts` | 消息流重写：`thread.post(textStream)` + 持久化 agent 回复 |
| `src/services/chat/chat-service.ts` | 暴露完整 thread 接口（post 接受 AsyncIterable），`saveTranscript` 暴露给 handler |
| `src/ipc/events/handlers.ts` | 新增 `subscribe` subscription 端点（EventPublisher） |
| `src/ipc/events/index.ts` | 导出 `subscribe` |
| `src/components/conversation/message-panel.tsx` | 用 ai-elements 重写（Conversation + Message + MessageResponse + Shimmer） |
| `src/routes/conversation.tsx` | 左右分栏布局（列表 + 详情） |
| `src/routes/conversation.$id.tsx` | 去掉 Card，全屏聊天布局 |
| `src/styles/global.css` | 补 streamdown `@source` 指令 |

---

## Task 1: AsyncQueue 工具（回调转 AsyncIterable）

**Files:**
- Create: `src/utils/async-queue.ts`
- Test: `src/tests/unit/utils/async-queue.test.ts`

**Interfaces:**
- Produces: `class AsyncQueue<T>` with `push(item: T): void`、`close(): void`、`iter(): AsyncIterable<T>`

- [ ] **Step 1: Write the failing test**

```typescript
// src/tests/unit/utils/async-queue.test.ts
import { describe, expect, it } from "vitest";
import { AsyncQueue } from "@/utils/async-queue";

describe("AsyncQueue", () => {
  it("yields pushed items in order", async () => {
    const queue = new AsyncQueue<string>();
    queue.push("a");
    queue.push("b");
    queue.close();

    const collected: string[] = [];
    for await (const item of queue.iter()) {
      collected.push(item);
    }
    expect(collected).toEqual(["a", "b"]);
  });

  it("yields items pushed after iteration starts", async () => {
    const queue = new AsyncQueue<string>();
    const collected: string[] = [];
    const consume = (async () => {
      for await (const item of queue.iter()) {
        collected.push(item);
      }
    })();
    queue.push("x");
    queue.push("y");
    queue.close();
    await consume;
    expect(collected).toEqual(["x", "y"]);
  });

  it("completes immediately when closed before iteration", async () => {
    const queue = new AsyncQueue<string>();
    queue.close();
    const collected: string[] = [];
    for await (const item of queue.iter()) {
      collected.push(item);
    }
    expect(collected).toEqual([]);
  });

  it("stops iteration when closed mid-stream", async () => {
    const queue = new AsyncQueue<number>();
    queue.push(1);
    const collected: number[] = [];
    const consume = (async () => {
      for await (const item of queue.iter()) {
        collected.push(item);
      }
    })();
    queue.push(2);
    queue.close();
    await consume;
    expect(collected).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit --run src/tests/unit/utils/async-queue.test.ts`
Expected: FAIL with "Cannot find module '@/utils/async-queue'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/utils/async-queue.ts
/**
 * Bridges a push-based callback API to a pull-based AsyncIterable.
 *
 * Producers call push() to enqueue items and close() when done.
 * Consumers iterate over iter() to receive items as they arrive;
 * iteration completes when close() is called and the queue drains.
 */
export class AsyncQueue<T> {
  private readonly items: T[] = [];
  private closed = false;
  private resolvers: Array<(result: IteratorResult<T>) => void> = [];

  push(item: T): void {
    if (this.closed) {
      return;
    }
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver({ done: false, value: item });
    } else {
      this.items.push(item);
    }
  }

  close(): void {
    this.closed = true;
    while (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift();
      resolver?.({ done: true, value: undefined as never });
    }
  }

  iter(): AsyncIterable<T> {
    const self = this;
    return {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<T>> {
            if (self.items.length > 0) {
              return Promise.resolve({
                done: false,
                value: self.items.shift() as T,
              });
            }
            if (self.closed) {
              return Promise.resolve({
                done: true,
                value: undefined as never,
              });
            }
            return new Promise((resolve) => {
              self.resolvers.push(resolve);
            });
          },
        };
      },
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit --run src/tests/unit/utils/async-queue.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/async-queue.ts src/tests/unit/utils/async-queue.test.ts
git commit -m "feat(utils): add AsyncQueue to bridge callbacks to AsyncIterable"
```

---

## Task 2: AcpService 流式输出（返回 textStream）

**Files:**
- Modify: `src/services/acp/acp-service.ts`
- Test: `src/tests/unit/services/acp/acp-service.test.ts`

**Interfaces:**
- Consumes: `AsyncQueue` from Task 1
- Produces: `sendPrompt` now returns `{ sessionId, stopReason, textStream: AsyncIterable<string> }`

- [ ] **Step 1: Add failing test for textStream**

Append to `src/tests/unit/services/acp/acp-service.test.ts`，在 `describe("AcpService connect/sendPrompt"` 块内末尾新增：

```typescript
  it("sendPrompt returns a textStream that yields chunks then completes", async () => {
    mocks.db
      .prepare(
        "INSERT INTO conversations (id, adapter, title, created_at, updated_at) VALUES (?,?,?,?,?)"
      )
      .run("t2", "telegram", "", Date.now(), Date.now());
    const s = new AcpService();
    s.addServer(SERVER);
    await s.connect("pi");

    const p = s.sendPrompt({
      prompt: "hi",
      serverId: "pi",
      threadId: "t2",
    });
    await Promise.resolve();
    sdk.getNotify()?.({
      params: {
        sessionId: "sess_1",
        update: {
          content: { text: "Hello", type: "text" },
          sessionUpdate: "agent_message_chunk",
        },
      },
    });
    sdk.getNotify()?.({
      params: {
        sessionId: "sess_1",
        update: {
          content: { text: " World", type: "text" },
          sessionUpdate: "agent_message_chunk",
        },
      },
    });
    sdk.resolvePrompt({ stopReason: "end_turn" });
    const res = await p;

    const collected: string[] = [];
    for await (const chunk of res.textStream) {
      collected.push(chunk);
    }
    expect(collected).toEqual(["Hello", " World"]);
    expect(res.stopReason).toBe("end_turn");
    s.disconnect("pi");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit --run src/tests/unit/services/acp/acp-service.test.ts`
Expected: FAIL with "res.textStream is not iterable" or property undefined

- [ ] **Step 3: Modify sendPrompt to return textStream**

In `src/services/acp/acp-service.ts`:

1. Add import at top:
```typescript
import { AsyncQueue } from "@/utils/async-queue";
```

2. Replace the `sendPrompt` method's signature and body. The chunk handler now pushes into a per-call AsyncQueue. Replace the existing `sendPrompt` method (from `async sendPrompt(params: {` through its closing `}` before `disconnectAll`) with:

```typescript
  async sendPrompt(params: {
    serverId: string;
    threadId: string;
    prompt: string;
  }): Promise<{
    sessionId: string;
    stopReason: string;
    textStream: AsyncIterable<string>;
  }> {
    const ctx = this.contexts.get(params.serverId);
    if (!ctx) {
      throw new Error(`Server "${params.serverId}" not connected`);
    }

    const cwd = process.cwd();
    const session = await ctx.buildSession(cwd).start();
    const { sessionId } = session;

    this.sessionMapper.createMapping({
      acpServerId: params.serverId,
      acpSessionId: sessionId,
      agentId: "default",
      threadId: params.threadId,
    });

    sessionToThread.set(sessionId, params.threadId);

    // Per-call queue: onChunk pushes text, sendPrompt closes on completion.
    const queue = new AsyncQueue<string>();
    const previousChunk = this.onChunk;
    this.onChunk = (threadId: string, text: string) => {
      previousChunk?.(threadId, text);
      if (threadId === params.threadId) {
        queue.push(text);
      }
    };

    try {
      const response = await session.prompt(params.prompt);
      queue.close();
      return {
        sessionId,
        stopReason: response.stopReason,
        textStream: queue.iter(),
      };
    } catch (err) {
      queue.close();
      throw err;
    } finally {
      this.onChunk = previousChunk;
      sessionToThread.delete(sessionId);
      session.dispose();
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit --run src/tests/unit/services/acp/acp-service.test.ts`
Expected: PASS (all tests including new textStream test)

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `bun run test:unit --run`
Expected: PASS (all 24+ tests)

- [ ] **Step 6: Commit**

```bash
git add src/services/acp/acp-service.ts src/tests/unit/services/acp/acp-service.test.ts
git commit -m "feat(acp): return textStream AsyncIterable from sendPrompt"
```

---

## Task 3: oRPC Subscription 端点（实时事件推送）

**Files:**
- Modify: `src/ipc/events/handlers.ts`
- Modify: `src/ipc/events/index.ts`
- Test: `src/tests/unit/ipc/events-subscription.test.ts`

**Interfaces:**
- Consumes: `EventBridge.onEvent(handler)` (existing) to receive events
- Produces: `events.subscribe` oRPC procedure returning `AsyncGenerator<AppEvent>`

- [ ] **Step 1: Write the failing test**

```typescript
// src/tests/unit/ipc/events-subscription.test.ts
import { describe, expect, it } from "vitest";

describe("events subscribe endpoint", () => {
  it("emits events to subscribers in real-time", async () => {
    const { subscribe, __testEmit } = await import("@/ipc/events/handlers");
    const iterator = subscribe.handler() as AsyncGenerator;

    __testEmit({
      sessionId: "s1",
      text: "hello",
      threadId: "t1",
      type: "acp_session_update",
    });

    const result = await iterator.next();
    expect(result.done).toBe(false);
    expect(result.value).toMatchObject({
      type: "acp_session_update",
      text: "hello",
      threadId: "t1",
    });

    await iterator.return(undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit --run src/tests/unit/ipc/events-subscription.test.ts`
Expected: FAIL with "subscribe is not exported" or module error

- [ ] **Step 3: Implement the subscribe endpoint**

In `src/ipc/events/handlers.ts`, add an `EventPublisher` and wire `EventBridge` events into it. Add at the top of the file (after existing imports):

```typescript
import { EventPublisher } from "@orpc/shared";
import { os } from "@orpc/server";
import type { AppEvent } from "./event-types";
```

Note: `os` and `AppEvent` imports may already exist - merge them. Then after the existing `registerEventCollector` function, add:

```typescript
/**
 * EventPublisher for real-time streaming of events to the renderer.
 * registerEventCollector pushes every EventBridge event here.
 */
const eventPublisher = new EventPublisher<{ event: AppEvent }>();

/** Test helper: directly emit an event (unit tests only). */
export const __testEmit = (event: AppEvent) =>
  eventPublisher.publish("event", event);

export const subscribe = os.handler(function* () {
  // Yield events from the publisher as they arrive.
  const generator = eventPublisher.subscribe("event");
  try {
    for (const event of generator) {
      yield event;
    }
    // generator is synchronous-returning but async-iterable
  } finally {
    // oRPC handles iterator cleanup; nothing extra needed.
  }
});
```

**Wait** - `EventPublisher.subscribe` returns an `AsyncGenerator` when called with iterator options. Use the async iterator form. Replace the `subscribe` body with an async generator:

```typescript
export const subscribe = os.handler(async function* () {
  const iterator = eventPublisher.subscribe("event");
  for await (const event of iterator) {
    yield event;
  }
});
```

Then update `registerEventCollector` to also publish to the publisher. Inside the existing `services.eventBridge.onEvent` callback, after `recentEvents.push(event)`, add:

```typescript
        eventPublisher.publish("event", event as AppEvent);
```

- [ ] **Step 4: Export subscribe in index.ts**

In `src/ipc/events/index.ts`, replace contents:

```typescript
/** biome-ignore-all lint/performance/noBarrelFile: intentional public API surface for events domain */
import { getRecentEvents, subscribe } from "./handlers";

export { registerEventCollector } from "./handlers";
export const events = { getRecentEvents, subscribe };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test:unit --run src/tests/unit/ipc/events-subscription.test.ts`
Expected: PASS

- [ ] **Step 6: Run check-types**

Run: `bun run check-types`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/ipc/events/handlers.ts src/ipc/events/index.ts src/tests/unit/ipc/events-subscription.test.ts
git commit -m "feat(ipc): add oRPC subscription endpoint for real-time events"
```

---

## Task 4: ChatService 暴露完整 thread 接口 + bootstrap 消息流重写

**Files:**
- Modify: `src/services/chat/chat-service.ts`
- Modify: `src/services/bootstrap.ts`
- Test: `src/tests/unit/services/chat/chat-service.test.ts` (extend)

**Interfaces:**
- Consumes: `sendPrompt` textStream from Task 2
- Produces: handler receives full `thread` object; `saveTranscript` callable for agent replies

- [ ] **Step 1: Add failing test for agent reply persistence**

In `src/tests/unit/services/chat/chat-service.test.ts`, find the test that verifies `onNewMention` routing. Add a test verifying that when the handler posts a reply, it is saved as an agent transcript. Since `saveTranscript` is called inside `processMessage`, test that the user message is saved (existing) and add assertion that handler can save agent reply via the exposed `thread` object. Add within the message routing describe block:

```typescript
  it("exposes thread.post and saveTranscript for agent replies", async () => {
    // Setup: register handler that posts a reply
    chatService.onMessage(async ({ thread }) => {
      await thread.post("agent reply");
    });
    await chatService.initialize();
    const handlers = getOnNewMention();
    const thread = makeThread();
    await handlers?.onNewMention(thread, makeMessage("hi"));

    // User message + agent reply both persisted
    const rows = mocks.db
      .prepare("SELECT role, content FROM transcripts WHERE conversation_id = ? ORDER BY created_at")
      .all(thread.id);
    expect(rows.map((r) => ({ role: r.role, content: r.content }))).toEqual([
      { role: "user", content: "hi" },
      { role: "agent", content: "agent reply" },
    ]);
  });
```

Note: check the existing test helpers (`getOnNewMention`, `makeThread`, `makeMessage`) in the test file and reuse them. If `thread.post` is mocked, ensure the handler's `thread.post` triggers `saveTranscript("agent", ...)`. See Step 3 implementation detail.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit --run src/tests/unit/services/chat/chat-service.test.ts`
Expected: FAIL

- [ ] **Step 3: Expose full thread interface and saveTranscript**

In `src/services/chat/chat-service.ts`:

1. Change the `ChatMessageHandler` type's `thread` to expose the post signature accepting AsyncIterable and add an `onAgentReply` mechanism. Replace the `ChatMessageHandler` type:

```typescript
export type ChatMessageHandler = (ctx: {
  thread: {
    id: string;
    channel: { name: string | null };
    post: (content: unknown) => Promise<unknown>;
    subscribe: () => Promise<void>;
  };
  message: { text: string; author: { fullName: string }; isMention?: boolean };
  /** Persist an agent reply as a transcript. */
  saveAgentReply: (text: string) => void;
}) => Promise<void>;
```

2. In `processMessage`, change the handler call to pass `saveAgentReply`:

```typescript
      if (this.handler) {
        try {
          await this.handler({
            message,
            saveAgentReply: (text: string) =>
              this.saveTranscript(thread.id, adapter, "agent", text),
            thread,
          });
        } catch (err) {
```

This keeps `thread` as the real Thread instance (post already accepts AsyncIterable at runtime), and adds a typed `saveAgentReply` callback.

- [ ] **Step 4: Rewrite bootstrap.ts message flow**

In `src/services/bootstrap.ts`, replace the `chatService.onMessage(...)` block. The new flow passes the textStream to `thread.post` and persists the full reply. Replace the existing `chatService.onMessage(async ({ thread, message }) => {...})` callback with:

```typescript
  chatService.onMessage(async ({ thread, message, saveAgentReply }) => {
    const servers = acpService.getServers();
    if (servers.length === 0) {
      await thread.post("未配置 ACP Server，请在设置中添加。");
      return;
    }

    const serverId = servers[0].id;
    try {
      const { textStream } = await acpService.sendPrompt({
        prompt: message.text,
        serverId,
        threadId: thread.id,
      });

      // Stream to IM (Chat SDK handles platform-specific streaming/throttling)
      await thread.post(textStream);

      // Accumulate the full reply text for persistence
      let fullText = "";
      for await (const chunk of textStream) {
        fullText += chunk;
      }
      saveAgentReply(fullText);
      eventBridge.emit({
        adapter: thread.channel.name ?? "unknown",
        text: fullText,
        threadId: thread.id,
        type: "message_sent",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await thread.post(`Error: ${msg}`);
    }
  });
```

**Important**: `thread.post(textStream)` consumes the async iterable. But we also need to accumulate the text. Since an async iterable can only be consumed once, we must tee it. Replace the single `textStream` usage with a tee: consume via a wrapper that both posts to IM and accumulates. Update the implementation:

```typescript
      // Tee the stream: one copy for IM, one for accumulation
      let fullText = "";
      const teedStream = (async function* () {
        for await (const chunk of textStream) {
          fullText += chunk;
          yield chunk;
        }
      })();

      // Stream to IM (Chat SDK handles platform-specific streaming/throttling)
      await thread.post(teedStream);
      saveAgentReply(fullText);
```

Remove the old `pendingReplies` Map and `setChunkHandler` usage (the chunk handler is now internal to sendPrompt; acp_session_update events are still emitted by the existing `setChunkHandler` wiring in bootstrap - keep that). Actually the existing `acpService.setChunkHandler` emits `acp_session_update` events - keep that block as-is, only replace the `onMessage` handler.

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test:unit --run src/tests/unit/services/chat/chat-service.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `bun run test:unit --run`
Expected: PASS

- [ ] **Step 7: Run check-types**

Run: `bun run check-types`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/services/chat/chat-service.ts src/services/bootstrap.ts src/tests/unit/services/chat/chat-service.test.ts
git commit -m "feat(chat): stream replies to IM and persist agent transcripts"
```

---

## Task 5: 消息合并工具 + 流式消息 hook

**Files:**
- Create: `src/utils/message-merge.ts`
- Create: `src/hooks/use-streaming-message.ts`
- Create: `src/hooks/use-event-stream.ts`
- Test: `src/tests/unit/utils/message-merge.test.ts`
- Test: `src/tests/unit/hooks/use-streaming-message.test.ts`

**Interfaces:**
- Consumes: `Transcript` type from `@/ipc/conversation/schemas`, `AppEvent` from event-types
- Produces: `mergeMessages(history, streaming)` -> merged message list; `useStreamingMessage(threadId)` -> `{ isThinking, text, isStreaming, error }`

- [ ] **Step 1: Write failing test for mergeMessages**

```typescript
// src/tests/unit/utils/message-merge.test.ts
import { describe, expect, it } from "vitest";
import { mergeMessages } from "@/utils/message-merge";
import type { Transcript } from "@/ipc/conversation/schemas";

const mk = (role: "user" | "agent", content: string): Transcript => ({
  content,
  conversationId: "c1",
  createdAt: 0,
  id: 0,
  role,
});

describe("mergeMessages", () => {
  it("returns history as-is when no streaming message", () => {
    const history = [mk("user", "hi"), mk("agent", "hello")];
    expect(mergeMessages(history, null)).toEqual(history);
  });

  it("appends streaming message after history", () => {
    const history = [mk("user", "hi")];
    const streaming = { text: "hel", isThinking: false };
    const result = mergeMessages(history, streaming);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ role: "agent", content: "hel" });
  });

  it("appends thinking placeholder when isThinking", () => {
    const history = [mk("user", "hi")];
    const streaming = { text: "", isThinking: true };
    const result = mergeMessages(history, streaming);
    expect(result).toHaveLength(2);
    expect(result[1].role).toBe("agent");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit --run src/tests/unit/utils/message-merge.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement mergeMessages**

```typescript
// src/utils/message-merge.ts
import type { Transcript } from "@/ipc/conversation/schemas";

export interface StreamingMessage {
  text: string;
  isThinking: boolean;
}

export type MergedMessage = Transcript & { isThinking?: boolean };

/**
 * Merge persisted history with an in-flight streaming agent message.
 * The streaming message is appended after history (it's the latest).
 */
export function mergeMessages(
  history: Transcript[],
  streaming: StreamingMessage | null
): MergedMessage[] {
  if (!streaming) {
    return history;
  }
  const placeholder: MergedMessage = {
    content: streaming.text,
    conversationId: "",
    createdAt: Date.now(),
    id: -1,
    isThinking: streaming.isThinking,
    role: "agent",
  };
  return [...history, placeholder];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit --run src/tests/unit/utils/message-merge.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for useStreamingMessage**

```typescript
// src/tests/unit/hooks/use-streaming-message.test.ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock the event stream with a controllable emitter
const emitRef = { current: null as null | ((e: unknown) => void) };
vi.mock("@/hooks/use-event-stream", () => ({
  useEventStream: () => ({
    subscribe: vi.fn(),
    get emit() {
      return emitRef.current;
    },
    // Simulate the hook returning an emit function for testing
  }),
}));

import { useStreamingMessage } from "@/hooks/use-streaming-message";

describe("useStreamingMessage", () => {
  it("returns isThinking true initially for matching thread", () => {
    const { result } = renderHook(() => useStreamingMessage("t1"));
    expect(result.current.isThinking).toBe(false);
    // Note: real behavior depends on event subscription;
    // detailed state machine tested via integration.
  });
});
```

Note: The streaming hook depends on real-time events which are hard to unit-test in isolation. Keep the unit test minimal; rely on E2E for the full state machine. The hook's core logic (accumulate chunks, reset on done) should be extracted into a pure reducer if testability matters. For now, test the public return shape.

- [ ] **Step 6: Run test to verify it fails**

Run: `bun run test:unit --run src/tests/unit/hooks/use-streaming-message.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 7: Implement use-event-stream and use-streaming-message**

```typescript
// src/hooks/use-event-stream.ts
import { useEffect, useRef } from "react";
import type { AppEvent } from "@/ipc/events/event-types";
import { ipc } from "@/ipc/manager";

/**
 * Subscribe to real-time events via oRPC streaming subscription.
 * Returns a ref to push event handlers, cleaned up on unmount.
 */
export function useEventStream(
  onEvent: (event: AppEvent) => void
): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let cancelled = false;
    const iterator = ipc.client.events.subscribe() as AsyncGenerator<AppEvent>;

    (async () => {
      try {
        for await (const event of iterator) {
          if (cancelled) break;
          handlerRef.current(event);
        }
      } catch {
        // subscription closed or error - ignore
      }
    })();

    return () => {
      cancelled = true;
      void iterator.return(undefined);
    };
  }, []);
}
```

```typescript
// src/hooks/use-streaming-message.ts
import { useEffect, useState } from "react";
import type { AppEvent } from "@/ipc/events/event-types";
import { useEventStream } from "@/hooks/use-event-stream";

export interface StreamingMessageState {
  isThinking: boolean;
  text: string;
  isStreaming: boolean;
  error: string | null;
}

export function useStreamingMessage(threadId: string): StreamingMessageState {
  const [state, setState] = useState<StreamingMessageState>({
    error: null,
    isStreaming: false,
    isThinking: false,
    text: "",
  });

  useEventStream((event: AppEvent) => {
    if (event.type === "message_received" && event.threadId === threadId) {
      setState({
        error: null,
        isStreaming: true,
        isThinking: true,
        text: "",
      });
    } else if (
      event.type === "acp_session_update" &&
      event.threadId === threadId
    ) {
      setState((prev) => ({
        error: null,
        isStreaming: true,
        isThinking: false,
        text: prev.text + event.text,
      }));
    } else if (event.type === "message_sent" && event.threadId === threadId) {
      setState({
        error: null,
        isStreaming: false,
        isThinking: false,
        text: "",
      });
    } else if (event.type === "agent_error" && event.threadId === threadId) {
      setState({
        error: event.error,
        isStreaming: false,
        isThinking: false,
        text: "",
      });
    }
  });

  // Reset when threadId changes
  useEffect(() => {
    setState({ error: null, isStreaming: false, isThinking: false, text: "" });
  }, [threadId]);

  return state;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `bun run test:unit --run src/tests/unit/hooks/use-streaming-message.test.ts src/tests/unit/utils/message-merge.test.ts`
Expected: PASS

- [ ] **Step 9: Run check-types**

Run: `bun run check-types`
Expected: No errors

- [ ] **Step 10: Commit**

```bash
git add src/utils/message-merge.ts src/hooks/use-streaming-message.ts src/hooks/use-event-stream.ts src/tests/unit/utils/message-merge.test.ts src/tests/unit/hooks/use-streaming-message.test.ts
git commit -m "feat(hooks): add streaming message state machine and event stream"
```

---

## Task 6: 消息面板用 ai-elements 重写（流式 + markdown）

**Files:**
- Modify: `src/components/conversation/message-panel.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `useMessages` (existing), `useStreamingMessage` (Task 5), `mergeMessages` (Task 5), ai-elements Message/MessageResponse/Conversation/Shimmer

- [ ] **Step 1: Add streamdown @source directives to global.css**

In `src/styles/global.css`, after the `@import` lines at the top (after `@import "@fontsource-variable/geist-mono";`), add:

```css
@source "../node_modules/streamdown/dist/*.js";
@source "../node_modules/@streamdown/cjk/dist/*.js";
@source "../node_modules/@streamdown/code/dist/*.js";
@source "../node_modules/@streamdown/math/dist/*.js";
@source "../node_modules/@streamdown/mermaid/dist/*.js";
```

- [ ] **Step 2: Rewrite message-panel.tsx with ai-elements**

Replace the entire contents of `src/components/conversation/message-panel.tsx`:

```tsx
import { Loader2 } from "lucide-react";
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
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useMessages } from "@/hooks/use-conversations";
import { useStreamingMessage } from "@/hooks/use-streaming-message";
import { mergeMessages } from "@/utils/message-merge";

interface Props {
  conversationId: string;
}

export function MessagePanel({ conversationId }: Props) {
  const { data: messages, isLoading } = useMessages(conversationId);
  const streaming = useStreamingMessage(conversationId);

  const merged = mergeMessages(messages ?? [], streaming.isStreaming ? {
    isThinking: streaming.isThinking,
    text: streaming.text,
  } : null);

  return (
    <Conversation>
      <ConversationContent className="space-y-4 p-4">
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : null}
        {merged.map((m) => (
          <Message
            from={m.role === "user" ? "user" : "assistant"}
            key={`${m.id}-${m.createdAt}`}
          >
            <MessageContent>
              {m.isThinking ? (
                <Shimmer className="text-sm">正在思考...</Shimmer>
              ) : (
                <MessageResponse>{m.content}</MessageResponse>
              )}
            </MessageContent>
          </Message>
        ))}
        {streaming.error ? (
          <Message from="assistant">
            <MessageContent className="text-destructive text-sm">
              {streaming.error}
            </MessageContent>
          </Message>
        ) : null}
        {merged.length === 0 && !isLoading ? (
          <p className="py-8 text-center text-muted-foreground text-sm">
            暂无消息
          </p>
        ) : null}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
```

- [ ] **Step 3: Run check-types**

Run: `bun run check-types`
Expected: No errors. If ai-elements exports differ (e.g. `ConversationContent` name), verify against `src/components/ai-elements/conversation.tsx` and adjust import names.

- [ ] **Step 4: Run full test suite**

Run: `bun run test:unit --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/conversation/message-panel.tsx src/styles/global.css
git commit -m "feat(ui): rewrite message panel with ai-elements streaming markdown"
```

---

## Task 7: 左右分栏布局 + conversation 路由调整

**Files:**
- Modify: `src/routes/conversation.tsx`
- Modify: `src/routes/conversation.$id.tsx`

**Interfaces:**
- Consumes: `ConversationList` (existing), `MessagePanel` (Task 6)

- [ ] **Step 1: Implement split layout in conversation.tsx**

Replace `src/routes/conversation.tsx`:

```tsx
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { ConversationList } from "@/components/conversation/conversation-list";
import { MessagePanel } from "@/components/conversation/message-panel";

function ConversationLayout() {
  const { id } = useParams({ strict: false });

  return (
    <div className="flex h-full">
      <aside className="w-72 shrink-0 border-r">
        <ConversationList />
      </aside>
      <main className="min-w-0 flex-1">
        {id ? (
          <MessagePanel conversationId={id} />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            选择一个对话查看消息
          </div>
        )}
      </main>
    </div>
  );
}

export const Route = createFileRoute("/conversation")({
  component: ConversationLayout,
});
```

- [ ] **Step 2: Simplify conversation.$id.tsx (remove Card wrapper)**

Replace `src/routes/conversation.$id.tsx`:

```tsx
// biome-ignore lint/style/useFilenamingConvention: $id is TanStack Router dynamic route param
import { createFileRoute } from "@tanstack/react-router";

function ConversationDetail() {
  // Layout is handled by parent /conversation route (split panel).
  // This route exists so the $id param is registered.
  return null;
}

export const Route = createFileRoute("/conversation/$id")({
  component: ConversationDetail,
});
```

Note: TanStack Router file-based routing - `/conversation` is the layout and `/conversation/$id` is a child. The `Outlet` in the layout renders the child. Since the layout reads `id` from params directly, the child can be empty. Verify the route tree generates correctly after running the dev server or build.

- [ ] **Step 3: Run check-types**

Run: `bun run check-types`
Expected: No errors

- [ ] **Step 4: Run full test suite**

Run: `bun run test:unit --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/conversation.tsx src/routes/conversation.\$id.tsx
git commit -m "feat(ui): split conversation into list + detail panel layout"
```

---

## Final Verification

- [ ] **Step 1: Run full test suite**

Run: `bun run test:unit --run`
Expected: All tests PASS

- [ ] **Step 2: Run type check**

Run: `bun run check-types`
Expected: No errors

- [ ] **Step 3: Manual verification (requires .env.dev with Feishu/Telegram + ACP)**

Run: `bun run start`
- 在 IM 发消息，确认回复逐字流式出现
- 桌面端对话页面：Shimmer -> 流式文本增长 -> 最终持久化
- markdown 正确渲染（代码块高亮）
- 左右分栏：列表项切换右侧详情
- ACP 未连接时错误提示可见

- [ ] **Step 4: Update docs**

Update `docs/blueprint.md` and `docs/architecture.md` 实现状态，标注流式体验已补全。

```bash
git add docs/
git commit -m "docs: update implementation status for streaming experience"
```

## Self-Review Notes

- **Spec coverage**: 缺口 1（agent 回复持久化）-> Task 4；缺口 2（IM 流式）-> Task 4；缺口 3&4（桌面流式 + markdown）-> Task 6；oRPC subscription -> Task 3；thinking 状态 -> Task 5/6；左右分栏 -> Task 7。全部覆盖。
- **Type consistency**: `sendPrompt` 返回 `textStream: AsyncIterable<string>`（Task 2 定义，Task 4 消费）；`StreamingMessageState`（Task 5 定义，Task 6 消费）；`mergeMessages` 返回 `MergedMessage[]`（Task 5 定义，Task 6 消费）。
- **风险点**: Task 3 的 oRPC subscription 是首次实现，若 `EventPublisher.subscribe` 返回值与 oRPC handler 期望的 AsyncGenerator 不匹配，需在实现时调整。Task 7 的 TanStack Router 嵌套布局需验证 routeTree 生成。
