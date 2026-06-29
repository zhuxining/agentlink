> **Status**: `active`

# AgentLink 产品蓝图

> AgentLink 让你自己的 ACP Server 进入 IM 消息流。

## 定位

AgentLink 是一个**本地优先的 ACP-native Agent 编排层**。它复用用户已有的 ACP Server 执行能力，在本地管理 Agent 和 Skill，通过 Chat SDK 把 Agent 接入飞书、Telegram 等真实消息渠道。

三条产品边界：

1. **ACP-native**：不自研 Agent 执行运行时，通过 ACP 协议调用用户已有或自建的 ACP Server。
2. **编排层**：管"谁处理、用什么 Skill、什么时候切换"。ACP Server 管"如何执行"。
3. **Messaging-native**：把 Agent 接入真实 IM 消息流，不只停留在 IDE 或 CLI。

**明确排除**：自研 Agent 执行运行时、云端 SaaS 消息处理、关键词自动路由、多用户团队管理、模型供应商抽象层。

## 核心场景

1. **接入 ACP Server**：连接已有的 ACP Server。AgentLink 自动获取 Server 的能力信息，用户只需配置一个连接。
2. **管理 Agent**：创建 Agent，配置系统提示和模型偏好，关联 Skill，绑定默认 ACP Server。所有配置以文件存储，可直接用编辑器修改，修改即时生效。
3. **工作区**：指定工作目录作为 Agent 执行边界。可以打开多个工作区，快速切换。
4. **内置命令**：通过 `/` 命令切换 Agent、Skill、工作区或模式——显式选择，不做关键词自动路由。
5. **接入 IM 渠道**：启用飞书、Telegram 等渠道后，Agent 进入真实消息流。@提及开启新会话，内置命令切换 Agent，Agent 处理完直接回复到对话中。
6. **Desktop UI 控制台**：查看和管理 ACP Server、Agent、Skill、工作区和会话状态。关闭窗口后后台持续运行。

## 原则

- **ACP 优先**：专注编排和渠道接入，底层执行交给 ACP Server。
- **内置命令选择**：`/` 命令切换 Agent 和 Skill，不做自动路由。
- **工作区边界**：Agent 在工作区目录范围内执行。可打开多个工作区，快速切换。
- **少渠道先闭环**：第一阶段用飞书和 Telegram 验证完整链路，不同时推进多渠道。
- **本地优先可观测**：消息不上传云端，用户可以看清哪个 Agent、哪个 Skill、哪个 ACP Server 处理了每条消息。

## 关键假设

- 用户已有或愿意搭建 ACP Server。验证：内测 ACP Server 连接成功率。
- 飞书和 Telegram 文本消息能代表第一阶段真实 IM 价值。验证：内测用户建议回复采纳率。
- 内置命令足以覆盖早期 Agent 和 Skill 选择。验证：命令使用频率。
- 单工作区足以覆盖第一阶段需求。验证：工作区切换频率。

## 文档关联

- 架构总览：`docs/architecture.md`
