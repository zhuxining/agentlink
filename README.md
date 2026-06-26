# AgentLink

> 让你自己的 ACP Agent 进入 IM 消息流。

AgentLink 是一个**本地优先的 ACP-native Agent 控制平面**。它复用你已有的 ACP Server 执行能力，在本地管理 Agent 角色、Skill 和会话状态，并通过 Chat SDK 把 Agent 接入 Feishu 等真实消息渠道。

## 文档

- [产品蓝图](docs/blueprint.md) — 定位、核心场景、产品原则
- [架构总览](docs/architecture.md) — 三层能力模型、边界划分、核心流程

## 技术栈

- [Electron 42](https://www.electronjs.org) + [Vite 8](https://vitejs.dev)
- [React 19](https://reactjs.org) + [TanStack Router](https://tanstack.com/router) + [shadcn/ui](https://ui.shadcn.com)
- [oRPC](https://orpc.unnoq.com) — Main ↔ Renderer IPC
- [Chat SDK](https://chat-sdk.dev) — 多渠道消息接入
- [Tailwind CSS 4](https://tailwindcss.com) + [Geist](https://vercel.com/font)
- [TypeScript 6](https://www.typescriptlang.org)
- [Biome](https://biomejs.dev) + [Ultracite](https://www.ultracite.ai)
- [Vitest](https://vitest.dev) + [Playwright](https://playwright.dev)

## 开发

```bash
bun install                # 安装依赖
bun run start              # 启动 Electron 应用（开发模式）
bun run check              # Lint + 格式化检查
bun run fix                # 自动修复 lint/格式化
bun run test:unit          # Vitest 单元测试
bun run test:e2e           # Playwright E2E 测试
bun run package            # 打包应用
bun run make               # 创建分发安装包
```

## 打包分发

通过 Electron Forge 打包，支持 Squirrel（Windows）、ZIP（macOS）、RPM/DEB（Linux）。发布通过 GitHub Releases 自动更新。

## License

MIT
