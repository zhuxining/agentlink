# 核心流式体验补全设计方案

**状态**: draft
**日期**: 2026-07-16
**关联**: [[docs/architecture.md]] [[docs/blueprint.md]] [[docs/superpowers/specs/2026-06-30-chat-sdk-acp-integration-design.md]]

## 1. 背景与目标

### 1.1 现状

Phase 1 端到端闭环已完成且测试通过（24 个单测全绿）：飞书/Telegram 渠道联通、ACP 集成可用、Conversation 路由打通。但在"收到消息 -> 流式回复"这条核心链路上存在 4 个遗留缺口：

| # | 缺口 | 位置 | 影响 |
|---|------|------|------|
| 1 | Agent 回复未持久化 | `bootstrap.ts` 只 `thread.post(reply)`，未调 `saveTranscript("agent", reply)` | 桌面端对话面板看不到 Agent 回复 |
| 2 | IM 侧非流式 | `bootstrap.ts` 收集整轮 chunks 再一次性 post | IM 用户等很久才收到全部回复 |
| 3 | 桌面端无流式组件 | `message-panel.tsx` 纯文本气泡，从 transcripts 读已完成消息 | 桌面端看不到实时流式响应 |
| 4 | 桌面端无 markdown 渲染 | 同上 | 代码块、列表等格式丢失 |

### 1.2 目标

把"收到消息 -> 流式回复"在 IM 和桌面端两端都做到完整闭环、体验扎实：

- **IM 侧**：ACP 流式回复逐字推送到飞书/Telegram
- **桌面端**：实时流式渲染 + markdown（代码高亮、数学、mermaid）+ thinking 状态 + 错误可见性
- **布局**：左右分栏（左对话列表常驻 + 右消息面板），更像 IM 应用

### 1.3 范围与非范围

**范围内**（方案二）：
- 主进程消息流重构（IM 流式 + agent 回复持久化）
- 桌面端流式 UI（ai-elements + streamdown + oRPC subscription + 左右分栏）
- thinking/loading 状态、错误可见性

**范围外**：
- Agent/Skill 管理、AgentResolver（Phase 2）
- 斜杠命令、工作区切换、Permission UI（Phase 3）
- 桌面端直接发消息触发 Agent（方案三，本次不做）
- 多 Agent 路由（继续用第一个 ACP Server 的简化逻辑）

### 1.4 关键利好（已验证）

1. **Chat SDK 的 `thread.post()` 直接接受 `AsyncIterable<string | StreamChunk>` 流式输入**，内部用 `StreamingMarkdownRenderer` + 适配器 `stream()`/`editMessage()` 自动处理限流和消息编辑。IM 侧流式无需手写限流逻辑。
2. **ai-elements 的 `MessageResponse` 组件内部已用 `Streamdown`**（含 `@streamdown/cjk`、`code`、`math`、`mermaid` 插件）处理流式 markdown。桌面端渲染层无需引入新库或造轮子。设计 spec 里计划的 `streaming-text.tsx` 组件被 ai-elements 取代，不再单独实现。
3. **oRPC 1.14 原生支持 subscription**（`EventPublisher`、`asyncIteratorToStream`、`consumeEventIterator`）。桌面端实时流式推送可通过 oRPC subscription over MessagePort 实现。

## 2. 架构概览

### 2.1 两端改造

```
┌─ IM 渠道（飞书/Telegram）─────────────────────────┐
│  ACP textStream (AsyncIterable)                   │
│    -> thread.post(textStream)   ← SDK 自动流式    │
│    -> 流结束 saveTranscript("agent", 全文)        │
└──────────────────────────────────────────────────┘

┌─ 桌面端 ─────────────────────────────────────────┐
│  oRPC subscription（新增）                       │
│    acp_session_update 事件实时推送                │
│      -> useStreamingMessage(threadId)            │
│      -> MessageResponse (Streamdown) 实时渲染     │
│  useMessages(id)（现有）                          │
│    -> transcripts 持久化历史                       │
│  合并：历史消息末尾追加"正在生成的 agent 消息"     │
└──────────────────────────────────────────────────┘
```

### 2.2 消息生命周期（桌面端状态机）

```
用户消息到达 (message_received)
  -> 显示 user 消息气泡 + 一个 thinking Shimmer 气泡
首 chunk 到达 (acp_session_update, 首个)
  -> Shimmer 换成流式 MessageResponse（Streamdown 实时渲染）
chunk 持续到达
  -> 累积追加到文本，Streamdown 自动处理未闭合 markdown
流结束 (message_sent)
  -> useMessages 刷新拿到持久化 agent 消息，临时流式消息移除
```

## 3. 服务层改造

### 3.1 AcpService - 流式输出从回调改成 AsyncIterable

**文件**: `src/services/acp/acp-service.ts`

当前 `sendPrompt` 用 `onUpdate` 回调和 `setChunkHandler`，已接收 `threadId` 参数。改造后 `sendPrompt` 返回值新增 `textStream`：
- `sessionId`、`stopReason`（现有）
- `textStream: AsyncIterable<string>`（ACP 文本 chunk 流）--新增

实现用一个简单的 `AsyncQueue` 工具：`onUpdate(chunk)` 入队，`sendPrompt` 完成时关闭队列。这个 `textStream` 喂给 `thread.post()`（IM 流式），同时逐 chunk emit `acp_session_update` 事件（桌面端流式）。

```typescript
// 改造后 sendPrompt 签名（概念）
async sendPrompt(params: {
  serverId: string;
  threadId: string;       // 已有：用于关联事件推送
  prompt: string;
}): Promise<{
  sessionId: string;
  stopReason: StopReason;
  textStream: AsyncIterable<string>;  // 新增
}>;
```

### 3.2 bootstrap.ts - 核心消息流重写

**文件**: `src/services/bootstrap.ts`

```
chatService.onMessage(({ thread, message }) => {
  1. saveTranscript("user", message.text)          ← 已有
  2. emit("message_received")                       ← 已有
  3. const { textStream } = await acpService.sendPrompt({
       serverId, threadId: thread.id, prompt: message.text
     })
  4. thread.post(textStream)                        ← 改：传 AsyncIterable，SDK 自动流式
  5. 累积 textStream 文本 -> saveTranscript("agent", 全文)   ← 新增：持久化 agent 回复
  6. emit("message_sent", { text: 全文 })           ← 保留
})
```

保留 `acp_session_update` 事件推送（逐 chunk），供桌面端流式渲染用。

**agent 回复持久化时机决策**：流结束后存完整文本。理由：
- YAGNI，transcripts 是消息历史不是流式日志
- 流式渲染靠事件推送实时完成，持久化只需最终结果
- 不用改 transcripts 表结构（保持 `content` 字段存完整文本）

### 3.3 ChatService - 暴露完整 thread 接口

**文件**: `src/services/chat/chat-service.ts`

当前 `processMessage` 把 thread 类型收窄成 `{ id, channel, post, subscribe }`。改造：
- 传入完整 `Thread` 实例（或至少让 `post` 接受 `AsyncIterable` 类型），让 `thread.post(asyncIterable)` 类型正确
- `saveTranscript` 从 private 暴露给 handler 调用（持久化 agent 回复）

### 3.4 thinking 状态与错误

- **thinking 状态**：桌面端不依赖新事件类型。`message_received` 后、首个 `acp_session_update` 前，`useStreamingMessage` 返回 `{ isThinking: true, text: "" }`，UI 显示 `Shimmer`。首个 chunk 到达后 `isThinking` 转 false。无需后端新增 `agent_thinking` 事件--YAGNI。
- **错误**：ACP 失败时已有 `agent_error` 事件，保持。桌面端订阅后显示错误提示。

## 4. IPC 层改造

### 4.1 新增 oRPC Streaming Subscription

**文件**: `src/ipc/events/handlers.ts`、`src/ipc/events/index.ts`

新增 `subscribe` subscription 端点：基于 oRPC `EventPublisher`，renderer 订阅后实时收到 `acp_session_update` 事件（以及现有的 `message_received`、`message_sent`、`agent_error` 等高频事件）。

**保留现有 `getRecentEvents` 轮询**给低频事件（适配器状态、ACP Server 状态等）。两套机制并存：高频流式走 subscription，低频状态走轮询。

### 4.2 事件类型

**文件**: `src/ipc/events/event-types.ts`

现有 `acp_session_update` 事件类型保持不变（`{ sessionId, threadId, text }`）。无需新增事件类型--thinking 状态由前端推断。

## 5. UI 层改造

### 5.1 左右分栏布局

**文件**: `src/routes/conversation.tsx`

当前对话列表单独一页、详情页跳转。改成左右分栏：
- 左侧：`ConversationList` 常驻（固定宽度，可折叠）
- 右侧：`MessagePanel`（选中项的消息内容，撑满剩余空间）
- 未选中对话时右侧显示空状态（`ConversationEmptyState` 组件）
- 路由调整：`/conversation` 列表 + `/conversation/$id` 详情共用分栏布局，详情区随选中项切换，不整页跳转

### 5.2 消息面板重写

**文件**: `src/components/conversation/message-panel.tsx`

用 ai-elements 组件重写：
- `Conversation`（auto-scroll 容器，基于 `use-stick-to-bottom`）
- 遍历合并后的消息列表，每条用 `Message`（区分 `from: "user" | "assistant"`）+ `MessageContent`
- 消息正文用 `MessageResponse`（内部 `Streamdown`，含 cjk/code/math/mermaid 插件）
- thinking 状态用 `Shimmer` 组件
- 错误状态显示 `agent_error` 事件内容

**两源数据合并**：
```
持久化历史：useMessages(id) -> transcripts 表 -> [user, agent, user, agent ...]
实时流式：useStreamingMessage(id) -> oRPC subscription -> acp_session_update chunks
合并：历史消息末尾追加"正在生成的 agent 消息"（如果有）
```

### 5.3 新增 Hooks

**文件**: `src/hooks/use-streaming-message.ts`（新增）

订阅 oRPC subscription，按 threadId 过滤，返回：
- `isThinking: boolean` - 是否在等待首 chunk
- `text: string` - 当前累积的流式文本
- `isStreaming: boolean` - 是否正在流式
- `error: string | null` - 错误信息

**文件**: `src/hooks/use-event-stream.ts`（新增）

oRPC subscription 客户端，订阅 `acp_session_update` 事件，供 `useStreamingMessage` 使用。

### 5.4 样式补全

**文件**: `src/styles/global.css`

补 `@source` 指令（当前缺失，导致 ai-elements `MessageResponse` 的 Streamdown 样式不生效）：
- `streamdown`
- `@streamdown/cjk`
- `@streamdown/code`
- `@streamdown/math`
- `@streamdown/mermaid`

### 5.5 conversation 路由布局调整

**文件**: `src/routes/conversation.$id.tsx`

当前用 `Card` 包裹 `MessagePanel`。改成全屏聊天布局（去掉 Card，`MessagePanel` 直接撑满），更像 IM 应用。

## 6. 改动清单

### 主进程

| 文件 | 改动 |
|------|------|
| `src/services/acp/acp-service.ts` | `sendPrompt` 返回值新增 `textStream: AsyncIterable<string>` |
| `src/services/bootstrap.ts` | 消息流重写：`thread.post(textStream)` + 持久化 agent 回复 |
| `src/services/chat/chat-service.ts` | 暴露完整 thread 接口，`saveTranscript` 可被 handler 调用 |
| `src/ipc/events/handlers.ts` | 新增 `subscribe` subscription 端点 |
| `src/ipc/events/index.ts` | 导出 `subscribe` |

### 渲染进程

| 文件 | 改动 |
|------|------|
| `src/components/conversation/message-panel.tsx` | 用 ai-elements 重写（Conversation + Message + MessageResponse + Shimmer） |
| `src/hooks/use-streaming-message.ts` | 新增：流式消息状态机 |
| `src/hooks/use-event-stream.ts` | 新增：oRPC subscription 客户端 |
| `src/routes/conversation.tsx` | 左右分栏布局 |
| `src/routes/conversation.$id.tsx` | 去掉 Card，全屏聊天布局 |
| `src/styles/global.css` | 补 streamdown `@source` 指令 |

### 工具

| 文件 | 改动 |
|------|------|
| `src/utils/async-queue.ts` | 新增：回调转 AsyncIterable 的 AsyncQueue 工具 |

## 7. 测试策略

遵循 AGENTS.md 约定：Vitest + jsdom（单元）、Playwright（E2E）。

### 7.1 单元测试（主进程纯逻辑）

| 测试 | 覆盖点 |
|------|--------|
| `src/tests/unit/services/acp/acp-service.test.ts` 扩展 | `sendPrompt` 返回的 `textStream` 是 AsyncIterable，逐 chunk yield，结束时关闭 |
| `src/tests/unit/utils/async-queue.test.ts`（新增） | AsyncQueue：onUpdate 入队、close 出队、消费完无泄漏 |
| `src/tests/unit/services/chat/chat-service.test.ts` 扩展 | handler 收到的 thread 对象能 `post(asyncIterable)`；agent 回复被 `saveTranscript` 持久化 |
| `src/tests/unit/ipc/events-subscription.test.ts`（新增） | `subscribe` 端点订阅后能收到 `acp_session_update` 事件 |

### 7.2 单元测试（渲染进程纯逻辑）

| 测试 | 覆盖点 |
|------|--------|
| `src/tests/unit/hooks/use-streaming-message.test.ts`（新增） | 状态机：thinking -> 首个 chunk -> 累积 -> 结束；按 threadId 过滤；流结束后清空 |
| `src/tests/unit/utils/message-merge.test.ts`（新增） | 合并函数：持久化历史 + 临时流式消息的正确拼接顺序 |

### 7.3 E2E（Playwright）

- 对话面板流式渲染：触发一条消息，验证 Shimmer 出现 -> 流式文本增长 -> 最终持久化消息替换
- 左右分栏布局：列表项切换右侧详情

### 7.4 不测的

- streamdown 内部的 markdown 解析（库的职责）
- Chat SDK 的 `thread.post(asyncIterable)` 流式行为（SDK 的职责）
- 3 秒轮询保留部分（无变更）

> 流式动画的逐字效果不做断言级测试（脆弱），只验证"消息最终正确渲染且持久化"。

## 8. 验证步骤

1. **启动应用**：`bun run start`，确认 Electron 窗口正常打开
2. **配置**：启用飞书/Telegram 适配器 + 添加 ACP Server（或用 `.env.dev`）
3. **IM 流式验证**：在 IM 发消息，确认回复逐字流式出现（而非等很久一次性出现）
4. **桌面端流式验证**：对话页面收到消息时，确认 Shimmer -> 流式文本增长 -> 最终持久化
5. **markdown 验证**：Agent 回复含代码块、列表时，确认正确渲染（代码高亮等）
6. **持久化验证**：关闭重开，确认 agent 回复已在对话历史中
7. **布局验证**：左侧对话列表常驻，点击切换右侧详情
8. **错误验证**：ACP Server 未连接时发消息，确认错误提示可见
9. **测试**：`bun run test:unit` 全绿，新增测试覆盖改动逻辑

## 9. 风险与注意事项

- **IM 流式限流**：飞书/Telegram 消息编辑有速率限制，依赖 Chat SDK 适配器内部处理。如出现限流错误，需检查 SDK 的 `StreamOptions` 配置。
- **oRPC subscription over MessagePort**：首次实现，需验证 MessagePort 通道上的 subscription 稳定性（断连、重订阅场景）。
- **streamdown 样式**：`@source` 路径需根据实际 `node_modules` 位置调整（项目用 bun，可能 hoisted）。
- **布局变更影响**：左右分栏需要调整 `conversation.tsx` 和 `conversation.$id.tsx` 两个路由的协同，注意 TanStack Router 的布局嵌套。

## 10. 文档关联

- 产品蓝图：`docs/blueprint.md`
- 架构总览：`docs/architecture.md`
- Phase 1 集成设计：`docs/superpowers/specs/2026-06-30-chat-sdk-acp-integration-design.md`
