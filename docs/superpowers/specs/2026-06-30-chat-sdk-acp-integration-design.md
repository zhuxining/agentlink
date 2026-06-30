# Chat SDK + ACP 集成设计方案

**状态**: draft
**日期**: 2026-06-30
**关联**: [[docs/architecture.md]] [[docs/blueprint.md]]

## 1. 背景与目标

### 1.1 问题

AgentLink 需要通过飞书和 Telegram 两个 IM 渠道接收用户消息，转发给 ACP (Agent Client Protocol) Agent 处理，并将 AI 响应流式返回给用户。

当前代码 (`src/services/channel.ts`) 有一个 Chat SDK 的初步集成，但结构混杂（实例管理、适配器注册、消息缓冲、环境注入全部耦合在一个文件中），且未接入 ACP。

### 1.2 目标

- **Phase 1**：打通端到端闭环 — 飞书/Telegram 发消息 → ACP Agent 回复
- **Phase 2**：完善 Agent/Skill 管理和对话 UI
- **Phase 3**：斜杠命令、工作区、高级特性

### 1.3 核心原则

1. **ACP-native**：不自行开发 Agent 执行运行时，复用已有 ACP Server
2. **编排层定位**：AgentLink 仅管理"谁处理、用什么 Skill、何时切换"
3. **Messaging-native**：通过 Chat SDK 接入真实 IM 消息流，尽量使用 Chat SDK 已有能力
4. **本地优先**：先满足本地开发调试场景，架构上预留常驻部署可能

## 2. 架构概览

### 2.1 三层架构

```
┌─ Channel Adapter Layer ─────────────────────┐
│  Chat SDK                                    │
│  ├─ @chat-adapter/telegram                   │
│  └─ @larksuite/vercel-chat-adapter           │
│  事件驱动：onNewMention / onDirectMessage     │
│  消息收发：thread.post() / thread.stream()   │
└──────────────┬───────────────────────────────┘
               │
┌──────────────┼───────────────────────────────┐
│  Agent Control Layer                         │
│  ├─ AgentResolver   消息 → Agent 映射        │
│  ├─ AgentManager    agents/*.md 管理         │
│  ├─ SkillManager    skills/*.md 管理         │
│  └─ SlashCommandRouter  斜杠命令路由         │
└──────────────┬───────────────────────────────┘
               │
┌──────────────┼───────────────────────────────┐
│  ACP Integration Layer                       │
│  ├─ AcpService     ACP Client 连接管理       │
│  ├─ AcpSessionMapper  Thread ↔ Session 映射  │
│  └─ AcpTransport   stdio transport           │
└──────────────────────────────────────────────┘

全部运行在 Electron Main Process
```

### 2.2 进程模型

```
┌─ 渲染进程 ────────────────────────────┐
│  React UI                             │
│  ├─ pages/  路由页面                   │
│  ├─ hooks/  react-query + event订阅   │
│  └─ actions/  IPC调用封装              │
│       │                                │
│  ipc/manager.ts  (MessagePort client) │
└───────┼────────────────────────────────┘
        │ @orpc/server MessagePort RPC
┌───────┼────────────────────────────────┐
│  主进程                                │
│  ipc/handler.ts → 路由到各 services    │
│       │                                │
│  services/                             │
│  ├─ chat/    Channel Adapter Layer    │
│  ├─ agent/   Agent Control Layer      │
│  ├─ acp/     ACP Integration Layer    │
│  └─ persistence/  持久化              │
└────────────────────────────────────────┘
```

## 3. 服务层设计

### 3.1 目录结构

```
src/services/
├─ chat/                          # Channel Adapter Layer
│   ├─ index.ts                   # 统一导出 + 初始化入口
│   ├─ chat-service.ts            # Chat 实例生命周期 + 事件处理器
│   ├─ adapter-registry.ts        # 适配器注册与配置管理
│   └─ event-bridge.ts            # 事件→IPC 推送（薄层）
│
├─ agent/                         # Agent Control Layer (Phase 2)
│   ├─ index.ts
│   ├─ agent-manager.ts           # agents/*.md CRUD
│   ├─ agent-resolver.ts          # 消息→Agent 解析
│   ├─ skill-manager.ts           # skills/*.md 管理
│   └─ slash-command-router.ts    # 斜杠命令路由
│
├─ acp/                           # ACP Integration Layer
│   ├─ index.ts
│   ├─ acp-service.ts             # ACP Client 连接管理+消息发送
│   ├─ acp-session-mapper.ts      # Thread ↔ ACP Session 映射
│   └─ acp-transport.ts           # stdio transport 创建
│
└─ persistence/                   # 持久化
    ├─ index.ts
    ├─ config-store.ts            # electron-store（凭据加密存储）
    ├─ database.ts                # SQLite (agentlink.db)
    └─ state-adapter.ts           # Chat SDK 状态适配器
```

### 3.2 ChatService

```typescript
// chat-service.ts
class ChatService {
  private chat: Chat | null;
  private registry: AdapterRegistry;
  private eventBridge: EventBridge;

  constructor(registry: AdapterRegistry, eventBridge: EventBridge);

  // 生命周期
  async initialize(): Promise<void>;
  async shutdown(): Promise<void>;
  async rebuild(): Promise<void>;  // 适配器变更后重建

  // 适配器管理（委托给 registry）
  getAdapters(): AdapterEntry[];
  getEnabledAdapters(): AdapterEntry[];
  async enableAdapter(slug: string, env: Record<string, string>): Promise<void>;
  async disableAdapter(slug: string): Promise<void>;
}
```

关键设计决策：
- Chat 实例是单例，通过 `registry.buildAdapterMap()` 构建适配器映射
- 事件处理器在 `initialize()` 中注册，直接驱动消息处理流程
- **不使用**独立的 MessageBus — Chat SDK 事件即消息入口

### 3.3 AdapterRegistry

```typescript
// adapter-registry.ts
interface AdapterEntry {
  slug: string;           // 'lark' | 'telegram'
  name: string;           // 显示名称
  description: string;
  enabled: boolean;
  envVars: Record<string, string>;  // 加密存储
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  errorMessage?: string;
}

class AdapterRegistry {
  list(): AdapterEntry[];
  getEnabled(): AdapterEntry[];
  enable(slug: string, env: Record<string, string>): Promise<void>;
  disable(slug: string): Promise<void>;
  updateStatus(slug: string, status: AdapterEntry['status'], error?: string): void;
  buildAdapterMap(): Record<string, Adapter>;  // 供 Chat SDK 使用
}
```

### 3.4 AcpService

```typescript
// acp-service.ts
interface AcpServerConfig {
  id: string;
  name: string;
  command: string;        // 启动 ACP Server 的命令，如 'npx' ['@anthropic/claude-agent']
  args: string[];
  env?: Record<string, string>;
}

class AcpService {
  // Server 管理
  async addServer(config: AcpServerConfig): Promise<void>;
  async removeServer(id: string): Promise<void>;
  async connect(id: string): Promise<void>;
  async disconnect(id: string): Promise<void>;
  getServers(): AcpServerConfig[];
  getServerStatus(id: string): 'disconnected' | 'connecting' | 'connected' | 'error';

  // 消息发送（核心）
  async sendPrompt(params: {
    serverId: string;
    sessionId: string | null;     // null = 新建 session
    prompt: ContentBlock[];       // ACP ContentBlock 格式
    cwd: string;                  // 工作目录
    mcpServers?: McpServer[];     // MCP 服务器配置
    onUpdate: (update: SessionUpdate) => void;  // 流式回调
  }): Promise<{
    sessionId: string;
    stopReason: StopReason;
  }>;
}
```

关键设计决策：
- 每个 ACP Server 对应一个子进程（stdio transport）
- sendPrompt 内部处理 session/new、session/prompt、session/update 的完整 ACP 协议流程
- onUpdate 回调用于流式转发文本到 Chat SDK thread

### 3.5 AcpSessionMapper

```typescript
// acp-session-mapper.ts
class AcpSessionMapper {
  // 根据 Chat SDK Thread ID 查找对应的 ACP Session
  findByThreadId(threadId: string): AcpSessionRecord | null;

  // 创建新映射（新对话时）
  createMapping(params: {
    threadId: string;       // Chat SDK thread ID，如 'lark:oc_xxx:msg_xxx'
    acpServerId: string;
    acpSessionId: string;
    agentId: string;
  }): AcpSessionRecord;

  // ACP Session 关闭时移除映射
  closeSession(threadId: string): void;

  // 持久化到 SQLite
  private save(record: AcpSessionRecord): void;
}
```

### 3.6 端到端消息处理流程

```
飞书/Telegram 用户发送消息
        │
        ▼
ChatService (chat.onNewMention / chat.onDirectMessage)
        │
        ├─ 1. 识别斜杠命令? → slashCommandRouter.route()
        │
        ├─ 2. AgentResolver.resolve({
        │      threadId: thread.id,  // 'lark:oc_xxx:msg_xxx'
        │      adapter: 'lark',
        │      message,
        │      isSlashCmd: false,
        │    })
        │    → { agent, skills }
        │
        ├─ 3. AcpSessionMapper.findByThreadId(thread.id)
        │    → 复用已有 session 或新建
        │
        ├─ 4. AcpService.sendPrompt({
        │      serverId: agent.acpServerId,
        │      sessionId: existingSessionId ?? null,
        │      prompt: buildPrompt(agent, message),
        │      cwd: workspace.cwd,
        │      onUpdate: (update) => {
        │        if (update.type === 'agent_message_chunk') {
        │          thread.stream(update.text);  // 流式发回 IM
        │        }
        │        eventBridge.emit('acp_update', update);  // 推送 UI
        │      }
        │    })
        │
        ├─ 5. 保存 transcript 到 SQLite
        │
        └─ 6. eventBridge.emit('message_processed', {...})
```

## 4. IPC 层设计

### 4.1 路由域

```
src/ipc/
├─ router.ts          # 合并所有路由
├─ handler.ts         # RPCHandler 实例
├─ manager.ts         # 渲染进程客户端
├─ context.ts         # 共享上下文（BrowserWindow 引用）
│
├─ channel/           # Phase 1
│   ├─ handlers.ts    # listAdapters, enableAdapter, disableAdapter, getAdapterStatus
│   └─ schemas.ts
│
├─ acp/               # Phase 1
│   ├─ handlers.ts    # listAcpServers, addAcpServer, removeAcpServer, connect, disconnect
│   └─ schemas.ts
│
├─ conversation/      # Phase 1
│   ├─ handlers.ts    # listConversations, getConversation, getMessages
│   └─ schemas.ts
│
├─ events/            # Phase 1
│   ├─ handlers.ts    # subscribe (oRPC Subscription)
│   ├─ schemas.ts
│   └─ event-types.ts
│
├─ agent/             # Phase 2
├─ skill/             # Phase 2
├─ workspace/         # Phase 3
└─ file-index/        # Phase 3
```

### 4.2 实时事件类型

```typescript
// events/event-types.ts
type AppEvent =
  | { type: 'message_received'; threadId: string; adapter: string; message: IncomingMessage }
  | { type: 'message_sent'; threadId: string; adapter: string; text: string }
  | { type: 'adapter_status_changed'; adapter: string; status: AdapterStatus }
  | { type: 'acp_session_update'; sessionId: string; update: SessionUpdate }
  | { type: 'acp_server_status_changed'; serverId: string; status: string }
  | { type: 'agent_error'; threadId: string; error: string };
```

### 4.3 数据流：事件推送

```
ChatService 事件处理器
  │
  ▼
event-bridge.ts  (主进程)
  │ emit('message_received', payload)
  ▼
ipc/events/handlers.ts
  │ oRPC Subscription.emit()
  ▼
use-event-stream.ts  (渲染进程)
  │ react-query.invalidateQueries()
  ▼
UI 组件重新渲染
```

## 5. UI 层设计

### 5.1 路由结构

| 路由 | 页面 | Phase |
|------|------|-------|
| `/` | Dashboard 首页 | Phase 2 |
| `/channel` | 渠道管理 | Phase 1 |
| `/conversation` | 对话列表 | Phase 1 |
| `/conversation/:id` | 对话详情 + 消息面板 | Phase 1 |
| `/agent` | Agent 管理 | Phase 2 |
| `/settings` | 设置 (ACP Server、通用) | Phase 1 |

### 5.2 侧边栏导航

```
🏠 首页            → /
💬 对话            → /conversation
🔌 渠道            → /channel
🤖 Agent           → /agent (Phase 2)
⚙️ 设置            → /settings
```

### 5.3 关键组件

| 组件 | 职责 | Phase |
|------|------|-------|
| `channel/adapter-card.tsx` | 单个适配器卡片（名称、状态、开关、配置按钮） | 1 |
| `channel/adapter-env-dialog.tsx` | 凭据配置弹窗（appId/appSecret/token 等） | 1 |
| `channel/adapter-status.tsx` | 连接状态指示器（绿/黄/红） | 1 |
| `conversation/conversation-list.tsx` | 对话列表（按渠道分组、时间排序） | 1 |
| `conversation/message-panel.tsx` | 消息面板（含流式文本渲染） | 1 |
| `shared/streaming-text.tsx` | 流式文本渲染（逐字显示） | 1 |
| `settings/acp-server-list.tsx` | ACP Server 列表 + 添加/删除 | 1 |
| `settings/acp-server-form.tsx` | ACP Server 配置表单 | 1 |
| `agent/agent-list.tsx` | Agent 列表 | 2 |
| `agent/agent-editor.tsx` | Agent markdown 编辑器 | 2 |

### 5.4 Hooks 层

```typescript
// 所有数据获取使用 react-query
use-channels.ts       → useQuery({ queryKey: ['channels'], queryFn: () => channelActions.listAdapters() })
use-conversations.ts  → useQuery({ queryKey: ['conversations'], ... })
use-agents.ts         → useQuery({ queryKey: ['agents'], ... })
use-acp-servers.ts    → useQuery({ queryKey: ['acp-servers'], ... })

// 实时事件订阅
use-event-stream.ts   → useEffect(() => {
                          const sub = eventsActions.subscribe();
                          sub.on('message_received', () => queryClient.invalidateQueries({ queryKey: ['conversations'] }));
                          sub.on('adapter_status_changed', () => queryClient.invalidateQueries({ queryKey: ['channels'] }));
                          return () => sub.unsubscribe();
                        }, [])
```

## 6. 持久化设计

### 6.1 存储分层

| 数据 | 存储方式 | 说明 |
|------|----------|------|
| 适配器凭据 | electron-store + safeStorage 加密 | appId/appSecret/token |
| ACP Server 配置 | electron-store | 命令、参数 |
| Conversation 映射 | SQLite (agentlink.db) | Thread ID ↔ Agent ↔ ACP Session |
| 消息转录 | SQLite (agentlink.db) | 对话历史 |
| Chat SDK 状态 | @chat-adapter/state-memory | 线程订阅状态 |
| Agent 配置 | 文件系统 (agents/*.md) | Markdown 文件 |
| Skill 配置 | 文件系统 (skills/*.md) | Markdown 文件 |

### 6.2 SQLite 表结构

```sql
-- conversations 表
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,           -- Chat SDK thread ID: "lark:oc_xxx:msg_xxx"
  adapter TEXT NOT NULL,         -- 'lark' | 'telegram'
  agent_id TEXT,                 -- 绑定的 Agent ID
  acp_server_id TEXT,            -- 使用的 ACP Server
  acp_session_id TEXT,           -- 对应的 ACP Session ID
  title TEXT,                    -- 对话标题
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- transcripts 表
CREATE TABLE transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL,            -- 'user' | 'agent'
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

## 7. 安全

- 适配器凭据使用 `electron.safeStorage.encryptString()` 加密后存入 electron-store
- ACP Server 子进程通过 stdio 通信，不暴露网络端口
- 本地应用上下文，不涉及跨网络传输
- 消息内容和对话历史仅存储在本地 SQLite

## 8. 关键依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| `chat` | ^4.31.0 | Chat SDK 核心 |
| `@chat-adapter/telegram` | 已有 | Telegram 适配器 |
| `@larksuite/vercel-chat-adapter` | 已有 | 飞书适配器 |
| `@chat-adapter/state-memory` | 已有 | 内存状态适配器 |
| `@agentclientprotocol/sdk` | 新增 | ACP TypeScript SDK |
| `@orpc/server` + `@orpc/client` | 已有 | IPC RPC 框架 |
| `better-sqlite3` | 已有 | SQLite |
| `electron-store` | 新增 | 加密配置持久化 |

## 9. 实施计划

### Phase 1：核心闭环（本变更）

```
主进程:
  □ services/chat/chat-service.ts     Chat 实例 + 事件处理器
  □ services/chat/adapter-registry.ts  适配器注册/启用/禁用
  □ services/chat/event-bridge.ts      事件→IPC 推送
  □ services/acp/acp-service.ts        ACP Client 连接+消息发送
  □ services/acp/acp-session-mapper.ts Thread ↔ Session 映射
  □ services/acp/acp-transport.ts      stdio transport
  □ services/persistence/config-store.ts   electron-store
  □ services/persistence/database.ts       SQLite 初始化
  □ services/persistence/state-adapter.ts  Chat SDK 状态
  □ ipc/channel/*                      渠道管理 IPC
  □ ipc/events/*                       实时事件订阅
  □ ipc/acp/*                          ACP Server IPC
  □ ipc/conversation/*                 对话管理 IPC
  □ src/main.ts                        启动流程整合

渲染进程:
  □ components/channel/*               渠道管理 UI
  □ components/conversation/*          对话列表+消息面板
  □ components/settings/*              ACP Server 设置
  □ components/shared/streaming-text.tsx 流式文本
  □ hooks/use-channels.ts
  □ hooks/use-conversations.ts
  □ hooks/use-event-stream.ts
  □ hooks/use-acp-servers.ts
  □ actions/channel.ts
  □ actions/conversation.ts
  □ actions/acp.ts
  □ actions/events.ts
  □ routes/channel.tsx
  □ routes/conversation.tsx
  □ routes/conversation.$id.tsx
  □ routes/settings.tsx
  □ app-sidebar.tsx                    更新导航

清理:
  □ 删除 src/services/channel.ts (重写)
  □ 删除旧的 src/ipc/channel/* (重写)
  □ 删除旧的 src/components/channel-page.tsx (重写)
```

### Phase 2：Agent 管理 + Dashboard

### Phase 3：高级功能

## 10. 验证

### Phase 1 验证步骤

1. **启动应用**：`bun run start`，确认 Electron 窗口正常打开
2. **配置飞书适配器**：在渠道页面填入 appId/appSecret，点击启用
3. **配置 Telegram 适配器**：填入 botToken，点击启用
4. **配置 ACP Server**：在设置页面添加一个 ACP Server（如 Claude Agent）
5. **发送测试消息**：在飞书/Telegram 中向机器人发送消息
6. **验证响应**：确认 ACP Agent 的响应能流式返回给 IM 渠道
7. **验证 UI 更新**：对话页面实时显示新消息和流式响应
8. **关闭重启**：关闭应用重启，确认适配器凭据已加密持久化，SQLite 对话记录已保存

### 单元测试

- `services/chat/adapter-registry.test.ts`
- `services/acp/acp-session-mapper.test.ts`
- `services/acp/acp-service.test.ts`（mock ACP Server 子进程）

### E2E 测试

- Playwright 测试：渠道管理页面的适配器启用/禁用流程
