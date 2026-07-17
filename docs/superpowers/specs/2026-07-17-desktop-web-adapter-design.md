# 桌面端会话渠道化设计方案

**状态**: draft
**日期**: 2026-07-17
**关联**: [[docs/architecture.md]] [[docs/blueprint.md]] [[docs/superpowers/specs/2026-06-30-chat-sdk-acp-integration-design.md]] [[docs/superpowers/specs/2026-07-16-streaming-experience-design.md]]

## 1. 背景与目标

### 1.1 现状

Phase 1 端到端闭环已完成：飞书/Telegram 渠道联通、ACP 集成可用、Conversation 路由打通、桌面端流式渲染依赖 `useStreamingMessage` + `mergeMessages` + ai-elements 自建事件驱动机制。

但桌面端目前**只是一个只读观察者**：桌面用户无法在应用内直接发起对话触发 ACP，必须借助 IM 渠道（飞书/Telegram）发消息才能驱动 Agent。这造成：

| # | 缺口 | 影响 |
|---|------|------|
| 1 | 桌面端无法直接输入消息触发 Agent | 必须借助 IM 渠道，桌面端沦为只读面板 |
| 2 | 桌面端聊天 UI 自建状态机（事件流 + merge），未对齐 Chat SDK / AI SDK 标准 | 长期维护成本高，难以直接消费 AI SDK 标准能力（如 regenerate / stop / parts） |
| 3 | 渲染与传输自定义，缺乏协议级复用 | 增加新 part 类型（tool/data）需自建映射，与 ai-elements 设计意图错位 |

### 1.2 目标

把桌面端升级为 Chat SDK 的一个一等消息渠道，使桌面端：

- 可在应用内输入消息直接触发 ACP Agent，与 IM 渠道共用同一 `chatService.onMessage` handler；
- 渲染层迁移到 AI SDK `useChat` 标准生命周期，与 Chat SDK 官方 `@chat-adapter/web` 适配器对齐；
- 删除自建事件流式渲染机制，统一以 `useChat.messages` 为单一状态源；
- IM 渠道会话在桌面端只读展示持久化历史（MVP 不订阅事件流式）。

### 1.3 范围与非范围

**范围内**：
- 新增 `@chat-adapter/web` 作为 "desktop" adapter，注册到 ChatService；
- main 进程内置本地 HTTP server（`127.0.0.1`，端口动态分配），暴露 `POST /api/chat` 路由；
- renderer 用 `@chat-adapter/web/react` 的 `useChat` 消费 web adapter；
- `MessagePanel` 按 `conversation.adapter` 分发：web 走 useChat 闭环，IM 只读历史；
- 新增 web endpoint oRPC 端点（方案 B 按需拉取）；
- CSP 调整：补 `connect-src 'self' http://127.0.0.1:*`；
- 删除 `useStreamingMessage` / `useEventStream` / `mergeMessages` 及其单测；
- 删除 oRPC `events.subscribe` 端点（仅被 useEventStream 使用）。

**范围外**：
- 多 parts 富渲染（tool_call / plan / data / files）——后续 spec 评估；
- IM 渠道会话在桌面端准实时流式——保留只读历史 MVP，未来按需评估；
- 桌面端多用户认证——单机单用户，`getUser` 固定返回 `{id:"local"}`；
- 删除的事件流式架构回归到 IM 桌面端渲染——不回退。

### 1.4 关键利好（已验证）

1. **`@chat-adapter/web`** 已在 `package.json` 依赖中，由 Chat SDK 官方维护，讲 AI SDK UI message stream 协议，handler 与 IM 渠道共用 `chat.onDirectMessage`。文档：https://chat-sdk.dev/adapters/official/web
2. **web adapter 的前端绑** `@chat-adapter/web/react` 导出 `useChat`，预配置 `DefaultChatTransport` 指向 `/api/chat`，与 `ai-elements` 的 `<Conversation>`/`<Message>`/`<MessageResponse>` 直接对接。
3. **`thread.post(asyncIterable)`** web adapter 走原生 SSE streaming 路径，Pump text chunks 直接到 response body，honor `req.signal` 供 `useChat.stop()` 短路。
4. **现有 `chatService.onMessage` handler 不需改**：web adapter 的消息也触发它，与 IM 走同一 ACP 调用 + `saveTranscript` 持久化路径。
5. **transcripts/conversations 表零改动**：web adapter 消息的 `adapter` 字段为 `"web"`，由现有 `saveTranscript` 自动维护。

## 2. 传输通道分层

### 2.1 两条正交通道

```
┌─ Main 进程 ───────────────────────────────────────────────────────┐
│                                                                    │
│  ┌─ HTTP server (127.0.0.1:动态PORT) ─────────────────┐ POST /api/chat │
│  │   └─ bot.webhooks.web(request) → Chat SDK handler  → SSE response│
│  │      ↑ 仅 web 会话用                                                 │
│  └──────────────────────────────────────────────────────────────┘
│                                                                    │
│  ┌─ oRPC server (MessagePort) ───────────────────────────────┐     │
│  │   ├─ theme / window / app / shell（现有命令）           │     │
│  │   ├─ conversation.listConversations / getMessages      │     │
│  │   ├─ web.getEndpoint（新增，方案 B）                   │     │
│  │   └─ acp.addServer / connect / sendPrompt ...          │     │
│  │      ↑ 所有会话都需要（列表/设置/状态），与传输层解耦   │     │
│  └──────────────────────────────────────────────────────────────┘
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
        ↓ SSE                                ↓ MessagePort
┌─ Renderer ───────────────────────────────────────────────────────┐
│  MessagePanel (web 会话):                                          │
│    useChat({ api:"http://127.0.0.1:PORT/api/chat", threadId })    │
│      → POST/SSE 直连本地 HTTP server（不走 oRPC）                  │
│                                                                    │
│  会话列表 / 设置 / IM 状态:                                         │
│    ipc.client.conversation.*  / ipc.client.web.getEndpoint / ...  │
│      → oRPC over MessagePort（现有机制不动）                       │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 职责对照

| 维度 | HTTP + SSE（新建） | oRPC over MessagePort（现有） |
|------|-------------------|-----------------------------|
| 服务对象 | web 会话的**对话流**（messages 发送/流式回填） | 所有**非对话流**操作：会话列表、历史读取、设置、ACP 管理 |
| 谁用 | renderer 的 useChat | renderer 所有 IPC 调用 |
| 协议 | Chat SDK webhook → AI SDK UI message stream | oRPC 类型安全 RPC |
| 生命周期 | 由 main 进程启动并管理 | 现有，不动 |
| 跨进程 | main↔renderer 通过 localhost HTTP | main↔renderer 通过 MessagePort |

### 2.3 为什么不解到 oRPC 里

- web adapter 的 `handleWebhook(request): Promise<Response>` 是为 HTTP `Request`/`Response` 设计的，SSE 流式 response body 直接由 Chat SDK 写。oRPC 的 streaming RPC 是 `AsyncIterable` 而非 HTTP response，套进去要先拆解再重组，等于绕远路。
- useChat 的 `DefaultChatTransport` 走标准 `fetch` POST，已和 web adapter 对齐。换成自定义 transport over 异步迭代是**重新实现一遍协议**，违反"禁止绕过 Chat SDK"红线。
- oRPC 继续管它擅长的：类型安全、窄面端点、事件订阅。两者**正交**，不是替代关系。

## 3. Main 进程改造

### 3.1 文件组织

```
src/services/web/
├── index.ts            # 导出 createWebHttpServer / createLocalWebAdapter
├── server.ts           # 本地 HTTP server，POST /api/chat → chat.webhooks.web
└── adapter.ts          # 包装 createWebAdapter，固定 getUser
```

### 3.2 本地 HTTP server

`createWebHttpServer(chat, opts)` 核心结构：

- 仅监听 `127.0.0.1`，端口 `opts.port ?? 0`（0 = OS 分配）；
- 单路由 `POST /api/chat`：聚合 body → 构造 `Request` → 调 `chat.webhooks.web(request)` → 把 `response.body`（`ReadableStream`）pipe 到 `ServerResponse`；
- 非匹配路径返 404；
- `res` 关闭（client disconnect）触发 `AbortController.abort()`，传入 `Request.signal`，让 web adapter 的 `thread.post(stream)` 迭代器收到 `stop()` 终止；
- 返回 `{ port, close }`，`port` 是实际监听端口供 IPC 暴露。

技术要点：
- 使用 Node `node:http`（main 进程已是 Node 环境）；
- `Readable.fromWeb(response.body).pipe(res)` 处理 SSE 透传；
- `response.headers` 透传到 res（含 `Content-Type: text/event-stream`）；
- 出错时返 500，记录 `[web] handler error: <stack>`，不静默吞错（AGENTS.md 安全规范）。

### 3.3 本地 web adapter

`createLocalWebAdapter()` 包装 `createWebAdapter`：

```ts
createWebAdapter({
  userName: "AgentLink",
  getUser: () => ({ id: "local", name: "AgentLink User" }),
  threadIdFor: ({ user, conversationId }) =>
    `web:${user.id}:${conversationId}`,
  persistMessageHistory: true,
})
```

- `getUser` 固定返回 `{id:"local"}`——桌面端单机单用户，无远程客户端；
- `threadIdFor` 生成 `web:local:{conversationId}`，与 web adapter 默认格式一致；
- `persistMessageHistory: true`（默认）——让 chat-sdk 的 `MessageHistoryCache` 经 state adapter backfill `thread.messages`，handler 可见历史。

### 3.4 AdapterRegistry 改造

`src/services/chat/adapter-registry.ts`：

- `SUPPORTED` 数组追加 `"web"`；
- `loadAdapter("web")` 特殊路径：不走 `await import(pkg)` 动态导入（web adapter 包已在主 bundle），直接调 `createLocalWebAdapter()` 返回；
- `buildAdapterMap()` 把 web adapter 与其他 enabled adapter 合并到 map；
- web adapter 不依赖 env vars，`enable/disable` 流程短路（永远视为 enabled）。

### 3.5 ChatService 改造

`src/services/chat/chat-service.ts`：

- `processMessage` 已把 thread 类型收窄成 `{ id, channel: { name }, post, subscribe }`，对 web adapter 来说 `thread.channel.name === "web"`，类型兼容；
- `saveTranscript(thread.id, "web", role, content)`：web 会话走同一路径，零改动；
- `onMessage` handler 只持有一个，bootstrap 注册的 ACP handler 对 web 会话也生效，**不需要新注册**。

### 3.6 bootstrap 改造

`src/services/bootstrap.ts`：

```ts
const chatService = new ChatService(registry, eventBridge);
// web adapter 在 AdapterRegistry 层注入，ChatService.initialize() 自动包含
await chatService.initialize();
const chat = chatService.getChat();
if (chat) {
  const webServer = createWebHttpServer(chat);
  // port 通过 oRPC 端点 web.getEndpoint 按需暴露（方案 B）
  (globalThis as any).__webServer = webServer;
}
```

要点：
- web HTTP server 在 ChatService 初始化成功后才启动（避免 Chat 未就绪时 webhook 报错）；
- `webServer` 存全局，供 oRPC handler 读取 port；
- 出错时记录 `[bootstrap] Web HTTP server failed: <stack>`，不阻断主流程（chat 仍可用，只是桌面端发消息会失败）。

### 3.7 oRPC 端点：web.getEndpoint

新增 `src/ipc/web/`：

```
src/ipc/web/
├── handlers.ts    # getEndpoint handler
├── index.ts       # 导出
└── schemas.ts     # 无输入 schema，输出 z.string()
```

```ts
export const getEndpoint = os.handler(() => {
  const webServer = (globalThis as any).__webServer;
  if (!webServer) {
    throw new Error("Web HTTP server not ready");
  }
  return `http://127.0.0.1:${webServer.port}/api/chat`;
});
```

注册到 `src/ipc/router.ts` 的 `web` 命名空间；`src/actions/web.ts` 暴露 `getEndpoint()` 给 React。

### 3.8 CSP 改造

`index.html`：

```diff
- <meta content="script-src 'self';" http-equiv="Content-Security-Policy">
+ <meta content="script-src 'self'; connect-src 'self' http://127.0.0.1:*;" http-equiv="Content-Security-Policy">
```

- `script-src 'self'` 保留不动（AGENTS.md 硬约束）；
- 新增 `connect-src 'self' http://127.0.0.1:*`——仅放开 127.0.0.1 本地端口，不暴露外网；
- 评估：单机使用，无远程客户端，风险可控。

## 4. Renderer 改造

### 4.1 文件组织

```
src/components/conversation/
├── message-panel.tsx          # 入口：按 adapter 分发
├── web-chat.tsx               # web 会话（useChat 闭环 + 输入框）
├── im-chat.tsx                # IM 会话（只读历史，无 sendMessage）
└── chat-empty-state.tsx       # 空状态
src/hooks/
└── use-web-endpoint.ts        # 拉 web adapter endpoint（方案 B）
src/utils/
└── transcript-to-ui-messages.ts # Transcript[] -> UIMessage[]
```

### 4.2 endpoint 获取（方案 B）

```ts
// src/hooks/use-web-endpoint.ts
export function useWebEndpoint() {
  return useQuery({
    queryKey: ["webEndpoint"],
    staleTime: Infinity,   // 端口在 main 生命周期内不变
    queryFn: () => ipc.client.web.getEndpoint() as Promise<string>,
  });
}
```

- endpoint 未就绪时输入组件显示加载态；
- 就绪后 useChat 才实例化（避免空 api 报错）；
- 无竞态：renderer 渲染 useChat 前必须 wait `endpoint`。

### 4.3 Transcript → UIMessage 转换

```ts
// src/utils/transcript-to-ui-messages.ts
import type { UIMessage } from "ai";
import type { Transcript } from "@/ipc/conversation/schemas";

export function toUIMessages(transcripts: Transcript[]): UIMessage[] {
  return transcripts.map((t, i) => ({
    id: `t-${t.id ?? i}`,
    role: t.role === "user" ? "user" : "assistant",
    parts: [{ type: "text" as const, text: t.content, state: "done" as const }],
    metadata: { createdAt: new Date(t.createdAt) },
  }));
}
```

MVP 无 attachments/files，文本即可；后续扩展时在此处分支加 part。

### 4.4 WebChat（本地会话）

```tsx
// src/components/conversation/web-chat.tsx
import { useChat } from "@chat-adapter/web/react";
import { useWebEndpoint } from "@/hooks/use-web-endpoint";
import { PromptInput, PromptInputTextarea, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { UIMessage } from "ai";

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

  return (
    <Conversation>
      <ConversationContent>
        {messages.map((m) => (
          <Message key={m.id} from={m.role}>
            <MessageContent>
              {m.parts.map((p, i) =>
                p.type === "text" ? (
                  <MessageResponse key={i}>{p.text}</MessageResponse>
                ) : null
              )}
            </MessageContent>
          </Message>
        ))}
        {isBusy && messages.at(-1)?.role !== "assistant" && (
          <Message from="assistant">
            <MessageContent><Shimmer>正在思考...</Shimmer></MessageContent>
          </Message>
        )}
        {error && (
          <Message from="assistant">
            <MessageContent>
              <div className="text-destructive text-sm">{error.message}</div>
            </MessageContent>
          </Message>
        )}
      </ConversationContent>
      <ConversationScrollButton />
      <PromptInput onSubmit={(e) => {
        e.preventDefault();
        const text = new FormData(e.currentTarget).get("prompt") as string;
        if (text.trim() && !isBusy) void sendMessage({ text });
      }}>
        <PromptInputTextarea name="prompt" disabled={isBusy || !endpoint} />
        <PromptInputSubmit disabled={isBusy || !endpoint} onClick={isBusy ? stop : undefined}>
          {isBusy ? "停止" : "发送"}
        </PromptInputSubmit>
      </PromptInput>
    </Conversation>
  );
}
```

要点：
- **useChat.messages 是单一状态源**，去掉 useStreamingMessage/mergeMessages；
- **thinking 状态**：直接看 `status`，不用事件；
- **stop**：直接调 useChat.stop()——web adapter 的 `req.signal` 让 Chat SDK 的 `thread.post(stream)` 迭代器中断；
- **错误**：用 `error` 而非 `agent_error` 事件——web adapter 把 Chat handler 的 reject 翻成错误响应；
- `messages.at(-1)?.role !== "assistant"`：避免 assistant 消息本身正在流式时又叠加 Shimmer。

### 4.5 IMChat（只读历史）

```tsx
// src/components/conversation/im-chat.tsx
export function IMChat({ initialMessages, adapterName }: {
  initialMessages: UIMessage[];
  adapterName: string;
}) {
  return (
    <Conversation>
      <ConversationContent>
        {initialMessages.length === 0 ? (
          <div className="flex size-full items-center justify-center text-muted-foreground text-sm">
            此 {adapterName} 会话暂无消息
          </div>
        ) : (
          initialMessages.map((m) => (
            <Message key={m.id} from={m.role}>
              <MessageContent>
                {m.parts.map((p, i) =>
                  p.type === "text" ? <MessageResponse key={i}>{p.text}</MessageResponse> : null
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

不引入 useChat——避免空 transport 边界问题。纯展示组件。

### 4.6 MessagePanel 入口分发

```tsx
// src/components/conversation/message-panel.tsx
import { useConversation, useMessages } from "@/hooks/use-conversations";
import { WebChat } from "./web-chat";
import { IMChat } from "./im-chat";
import { toUIMessages } from "@/utils/transcript-to-ui-messages";
import { Loader2 } from "lucide-react";

export function MessagePanel({ conversationId }: { conversationId: string }) {
  const { data: conv } = useConversation(conversationId);
  const { data: transcripts, isLoading } = useMessages(conversationId);

  if (isLoading || !conv) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
      </div>
    );
  }

  const initialMessages = useMemo(
    () => toUIMessages(transcripts ?? []),
    [transcripts]
  );

  // 每会话独立实例，key 强制 remount，避免 useChat 状态跨会话泄漏
  if (conv.adapter === "web") {
    return <WebChat key={conversationId} threadId={conversationId} initialMessages={initialMessages} />;
  }
  return <IMChat key={conversationId} initialMessages={initialMessages} adapterName={conv.adapter} />;
}
```

### 4.7 会话列表新建入口

在 `src/routes/conversation.tsx` 列表头部加"新建会话"按钮：

```tsx
async function createLocalConversation() {
  const threadId = `web:local:${nanoid()}`;
  await queryClient.invalidateQueries({ queryKey: ["conversations"] });
  navigate({ to: "/conversation/$id", params: { id: threadId } });
}
```

- 不预建 conversations 行——首条消息由 `saveTranscript("user", ...)` 自动 upsert（确认决策）；
- 空会话在列表上缺失直到发出第一条消息，可接受 MVP 成本；
- 列表项点击跳转后看到一个空白 WebChat，输入框可见即可发送。

### 4.8 历史刷新

- web 会话：useChat 自己管 messages；切换会话时 invalidate `["conversations"]` + `["conversations", id, "messages"]` 让列表/历史保持新鲜；
- 现有 `use-event-poller` 在 3 秒轮询里消费 `message_received/message_sent` 事件触发 invalidate，web 会话的消息也会触发这些事件，列表自动更新。

## 5. 旧代码清理与回归风险

### 5.1 删除清单

| 删除文件 | 随带删除的测试 |
|---------|---------------|
| `src/hooks/use-streaming-message.ts` | `src/tests/unit/hooks/use-streaming-message.test.ts` |
| `src/hooks/use-event-stream.ts` | （无单测） |
| `src/utils/message-merge.ts` | `src/tests/unit/utils/message-merge.test.ts` |
| `src/ipc/events/handlers.ts` 的 `subscribe` 端点 | `src/tests/unit/ipc/events-subscription.test.ts` |

### 5.2 保留并收窄

| 保留文件 | 说明 |
|---------|------|
| `src/hooks/use-event-poller.ts` | 走 `getRecentEvents` 轮询，收窄到刷新 `conversations`/`messages`/`channels`/`acp servers` query 缓存。web 会话发出的 `message_received/message_sent` 也会被它 invalidate |
| `src/ipc/events/handlers.ts` 的 `getRecentEvents` | 保留 |
| `src/ipc/events/event-bridge.ts` / `eventPublisher` | 不动 |

### 5.3 回归风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| 删 `useStreamingMessage` 后 IM 渠道消息在桌面端不再准实时显示 | 现有"飞书消息到达后桌面端看到流式 thinking→text"体验消失 | 已第 4 节确认只读历史 MVP 接受；IM 应用本身仍有流式。若反馈强烈，后续评估 |
| `message_received`/`message_sent` 事件失效 | poller 仍消费它们 invalidate 列表，不受影响 | 无需改 |
| web adapter `thread.post(textStream)` 在 Rolldown CJS 下的 minproc 问题 | bootstrap.ts 注释提到 vfile interop 已坏 | **关键验证点**：web adapter 走自己 SSE，不经 IM adapter.stream，需验证不触发该问题 |
| CSP connect-src 加 `http://127.0.0.1:*` | 安全内收窄（仅 127.0.0.1） | 单机不连远程，风险可控。AGENTS.md 约束保留 `script-src 'self'` |
| `chatService.onMessage` 单 handler 被 web 与 IM 共用 | 不存在冲突 | bootstrap 不需新注册 handler |

## 6. 改动清单

### 主进程

| 文件 | 改动 |
|------|------|
| `src/services/web/index.ts` | 新增：导出 |
| `src/services/web/server.ts` | 新增：本地 HTTP server |
| `src/services/web/adapter.ts` | 新增：`createLocalWebAdapter` |
| `src/services/chat/adapter-registry.ts` | `SUPPORTED` 追加 "web"；`loadAdapter("web")` 走本地路径 |
| `src/services/bootstrap.ts` | ChatService 初始化后启 web HTTP server |
| `src/ipc/web/handlers.ts` | 新增：`getEndpoint` |
| `src/ipc/web/index.ts` | 新增：导出 |
| `src/ipc/web/schemas.ts` | 新增：输出 schema |
| `src/ipc/router.ts` | 注册 `web` 命名空间 |
| `src/actions/web.ts` | 新增：`getEndpoint` action |
| `src/ipc/events/handlers.ts` | 删除 `subscribe` 端点 |

### 渲染进程

| 文件 | 改动 |
|------|------|
| `src/components/conversation/message-panel.tsx` | 重写：按 `conv.adapter` 分发 |
| `src/components/conversation/web-chat.tsx` | 新增：useChat + PromptInput 输入 |
| `src/components/conversation/im-chat.tsx` | 新增：只读 ai-elements 渲染 |
| `src/utils/transcript-to-ui-messages.ts` | 新增：Transcript → UIMessage |
| `src/hooks/use-web-endpoint.ts` | 新增：拉 endpoint |
| `src/routes/conversation.tsx` | 新建会话按钮 |
| `src/hooks/use-streaming-message.ts` | 删除 |
| `src/hooks/use-event-stream.ts` | 删除 |
| `src/utils/message-merge.ts` | 删除 |

### 配置

| 文件 | 改动 |
|------|------|
| `index.html` | CSP 加 `connect-src 'self' http://127.0.0.1:*` |

### 测试删除

| 文件 |
|------|
| `src/tests/unit/hooks/use-streaming-message.test.ts` |
| `src/tests/unit/utils/message-merge.test.ts` |
| `src/tests/unit/ipc/events-subscription.test.ts` |

## 7. 测试策略

遵循 AGENTS.md：Vitest + jsdom（单元）/ Playwright（E2E）。

### 7.1 单元测试（main 进程纯逻辑）

| 文件 | 覆盖点 |
|------|--------|
| `src/tests/unit/services/web/server.test.ts`（新增） | `createWebHttpServer`：非 POST/非 /api/chat 返 404；POST /api/chat 透传 Request 到 `chat.webhooks.web`；`response.body` 流式 pipe 到 res；res 关闭触发 abort；只绑 127.0.0.1 |
| `src/tests/unit/services/web/adapter.test.ts`（新增） | `createLocalWebAdapter`：`getUser` 固定返 `{id:"local"}`；`threadIdFor` 返 `web:local:{conversationId}`；`encodeThreadId/decodeThreadId` 对称 |
| `src/tests/unit/services/chat/adapter-registry.test.ts`（扩展或新增） | `SUPPORTED` 含 "web"；`loadAdapter("web")` 不走动态 import；未依赖 env vars |
| `src/tests/unit/services/chat/chat-service.test.ts`（扩展） | web 会话 `processMessage` 仍调 saveTranscript；handler 拿到的 thread.post 接受 AsyncIterable |
| `src/tests/unit/services/bootstrap.test.ts`（新增或扩展） | bootstrap 后 ChatService 包含 web adapter；web HTTP server 监听到非 0 端口 |

### 7.2 单元测试（renderer 纯逻辑）

| 文件 | 覆盖点 |
|------|--------|
| `src/tests/unit/utils/transcript-to-ui-messages.test.ts`（新增） | role 映射；parts text + state done；空数组返空；id 稳定 |
| `src/tests/unit/hooks/use-web-endpoint.test.ts`（新增） | mock `ipc.client.web.getEndpoint`；staleTime=Infinity 不重取 |
| `src/tests/unit/components/web-chat.test.tsx`（新增） | mock useChat 返回受控 messages，断 MessageResponse 渲染；isBusy 显示 Shimmer；error 显示 destructive；submit 调 sendMessage；stop 调 stop |
| `src/tests/unit/components/im-chat.test.tsx`（新增） | 空数组显空状态文案；非空渲染 MessageResponse；无输入框 DOM |
| `src/tests/unit/components/message-panel.test.tsx`（新增） | adapter=web 渲染 WebChat；其它渲染 IMChat；loading 显 spinner；key 随 conversationId 变化 |

### 7.3 E2E（Playwright）

新增 `src/tests/e2e/web-chat-flow.test.ts`：

| 场景 | 验证 |
|------|------|
| 启动应用 → 点新建会话 → 跳 web 会话 → 输入 "hello" 发送 → 等 assistant 气泡出现 → 重启应用 → 看到历史 | 端到端流式 + 持久化 |

约束：
- 依赖真实 ACP server（`.env.dev` 配置 `ACP_SERVER_PI_COMMAND/ARGS`）；
- CI workflow 增加 ACP server 安装步骤（如 `uv tool install` PI agent），写 `.env.dev`；
- 流式文字不按 chunk 断言，只断：assistant 气泡出现、内容非空、重启后历史存在；
- `test.setTimeout(60_000)` 应对 ACP 启动慢。

开发者本地执行：需先按 `.env.dev.example` 配置可启动 ACP server 才能跑 `test:e2e`，否则该用例 `test.skip`。

### 7.4 不测

- Streamdown markdown 渲染（库职责）
- Chat SDK 的 `thread.post(asyncIterable)` 流式传输（SDK 职责）
- `useChat` 内部状态机（@ai-sdk/react 职责）
- ACP SDK session/prompt 协议（外部依赖职责）
- Rolldown CJS interop（部署期验证）

## 8. 验证步骤

1. **启动应用**：`bun run start`，确认 Electron 窗口正常打开，控制台无 `[bootstrap] Web HTTP server failed` 报错；
2. **新建会话**：对话列表点"新建会话"按钮，跳转到空白 WebChat，输入框可见；
3. **配置 ACP**：启用飞书/Telegram 适配器 + 添加 ACP Server（或用 `.env.dev`）；
4. **桌面端发送**：在 WebChat 输入框输入 "hello"，回车发送：
   - 确认 Shimmer（正在思考）出现；
   - 确认 assistant 气泡中的流式文本逐字增长（SSE 流式）；
   - 确认发送过程中"停止"按钮可点击中断流式；
   - 流结束后确认消息持久化（切换会话再切回，消息仍在）；
5. **markdown 渲染**：Agent 回复含代码块/列表时，确认正确渲染（代码高亮等）；
6. **会话列表刷新**：发送首条消息后，确认会话列表出现新行（poller 3 秒内刷新）；
7. **IM 渠道会话**：切换到飞书/Telegram 会话，确认只读历史正确展示，无输入框；
8. **持久化验证**：关闭重开应用，确认 web 会话历史仍在；
9. **错误验证**：ACP Server 未连接时发消息，确认错误提示可见（error 显示）；
10. **CSP 验证**：开发者工具 Console 无 CSP 违规报告；
11. **测试**：`bun run test:unit` 全绿；`bun run check-types` 通过；`bun run fix` 无 lint 报错。

## 9. 风险与注意事项

- **web adapter `thread.post(textStream)` 的 Rolldown CJS interop**：bootstrap.ts 注释提到 vfile interop 在 Rolldown CJS 打包下已坏，当前 IM 流式已绕过该路径（collect full text 再 post）。web adapter 走自己原生 SSE streaming 路径（不经 IM adapter.stream），需在第 8 节验证步骤确认不触发该问题。若触发，fallback 为同样 collect-then-post，但失去流式。
- **CI 上的 ACP server**：ubuntu-latest 需安装并启动一个真实 ACP server（如 PI agent via `uv tool install`）。CI workflow 需新增步骤，开发者本地需 `.env.dev` 配置。
- **会话 key remount 性能**：每会话切换都重建 useChat 实例，频繁切换可能造成短暂卡顿。MVP 可接受；后续可优化为保留最近 N 个会话的实例缓存。
- **单 handler 共用**：web 与 IM 消息共用 `chatService.onMessage` 的同一 handler，无需新注册，无冲突。
- **CSP 收窄**：仅放开 `127.0.0.1:*`，不放开 `localhost:*`——Electron fetch 在 127.0.0.1 与 localhost 等价，但 CSP 严格匹配，需用实际监听地址 `127.0.0.1`。

## 10. 文档关联

- 产品蓝图：`docs/blueprint.md`
- 架构总览：`docs/architecture.md`
- Phase 1 集成设计：`docs/superpowers/specs/2026-06-30-chat-sdk-acp-integration-design.md`
- 流式体验设计：`docs/superpowers/specs/2026-07-16-streaming-experience-design.md`
- Chat SDK Web adapter 文档：https://chat-sdk.dev/adapters/official/web