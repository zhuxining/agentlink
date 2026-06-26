> **Status**: `active`

# AgentLink 产品蓝图

> AgentLink 让你自己的 ACP Agent 进入 IM 消息流。

## 定位

AgentLink 是一个**本地优先的 ACP-native Agent 控制平面**。它复用用户已有的 ACP Server 执行能力，在本地管理 Agent 角色、Skill 和会话状态，并通过 Chat SDK 把 Agent 接入 Feishu 等真实消息渠道。

三条产品边界：

1. **ACP-native**：不自研 Agent Server，通过 ACP 协议调用用户已有或自建的执行后端。
2. **Control plane**：管理 Agent、Skill、会话状态、默认 Agent 和显式命令——"谁在处理、用什么 Skill、什么时候切换"。ACP Server 管"如何执行"。
3. **Messaging-native**：把 Agent 接入真实 IM 消息流，不只停留在 IDE、CLI 或聊天窗口。

**明确排除**：自研 Agent runtime、云端 SaaS 消息处理、legacy RouteRule 自动路由、多用户团队管理、模型供应商抽象层。

## 核心场景

1. **接入 ACP Server**：用户注册本地 ACP Server，默认 Agent 绑定到该 Server。AgentLink 不关心 Server 内部模型或工具，只通过 ACP 协议收发请求和记录状态。
2. **管理 Agent 和 Skill**：创建 Agent，配置 Identity、默认 ACP Server，关联 Skill。Skill 独立管理，跨 Agent 复用。
3. **SlashCommand 显式选择**：对话中输入 `/review`、`/use`、`/skill` 等显式命令切换 Agent 或 Skill，不做关键词自动路由。控制命令：`/help`、`/default`、`/use`、`/skill`。
4. **接入 IM 渠道**：通过 Chat SDK 启用 Feishu 等渠道后，`onNewMention` 回调接收消息 → SlashCommandParser 解析命令 → AgentResolver 选择 Agent → AgentContext 组装上下文 → AcpClient 调用 ACP Server → `thread.post()` 建议回复。
5. **Desktop UI 控制台**：查看 ACP Server、Agent、Skill、渠道状态、消息处理和会话执行状态。窗口关闭到托盘后 Electron Main 进程保持运行，显式退出后停止。

## 原则

- **ACP 优先**：专注控制平面和渠道接入，底层执行交给用户 ACP Server。
- **显式选择**：`/命令` 切换 Agent/Skill，v1 不做关键词 RouteRule 或自动路由。
- **少渠道先闭环**：第一阶段用 Feishu 验证 ACP → Agent → Skill → 回复的完整链路，不同时推进多渠道。
- **本地优先、可观测**：不上传消息到云端，让用户看清哪个 Agent、哪个 Skill、哪个 ACP Server 处理了每条消息。

## 关键假设

- 用户已有或愿意搭建 ACP Server。验证：内测 ACP Server 连接成功率。
- Feishu 文本消息能代表第一阶段真实 IM 价值。验证：内测用户建议回复采纳率。
- 显式 SlashCommand 足以覆盖早期 Agent/Skill 选择。验证：命令使用频率和失败原因。

## 文档关联

- 架构总览：`docs/architecture.md`
