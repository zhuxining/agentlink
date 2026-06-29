# AGENTS.md

This file provides guidance to Code Agent when working with code in this repository.

## Commands

```bash
npm run start           # 启动 Electron 应用（开发模式）
npm run check           # 通过 Ultracite/Biome 运行 lint 和格式化检查
npm run fix             # 通过 Ultracite/Biome 自动修复 lint/格式化问题
npm run test:unit       # 运行 Vitest 单元测试（jsdom 环境）
npm run test:e2e        # 运行 Playwright E2E 测试（Electron + Chromium）
npm run test:all        # 顺序运行单元测试和 E2E 测试
npm run package         # 打包应用（不制作安装包）
npm run make            # 为当前平台创建可分发的安装包
npm run publish         # 在 GitHub Releases 上发布（会创建草稿版本）
npm run bump-ui         # 将 shadcn/ui 组件更新到最新版本
```

## 强制约束

### 不可修改的目录

- **`src/components/ui/`** — shadcn/ui 组件，由 `bun run bump-ui` 自动生成。禁止手动编辑。
- **`src/components/ai-elements/`** — AI Elements 组件库。禁止手动编辑。
- **`src/routeTree.gen.ts`** — TanStack Router 自动生成的路由树。禁止手动编辑。

### 样式

- 视觉样式（颜色、背景、边框、阴影、字体大小等）统一使用 shadcn/ui 组件和 Tailwind 主题系统（`src/styles/global.css` 中的 CSS 自定义属性）提供的设计 Token。禁止在自定义 CSS class 中新增颜色值或自定义视觉属性。
- 新增自定义 CSS class 仅用于排版布局（如 flex、grid、间距、定位、尺寸等结构性样式）。
- 图标统一使用 `lucide-react` 组件（如 `<X />`、`<Menu />`），禁止内联 `<svg>`、导入 SVG 文件或使用其他图标库。(除了`WindowButtons`组件中使用的Windows图标，其他地方禁止使用 SVG 文件)

### 包管理器

- 项目使用 **bun** 作为包管理器，锁文件为 `bun.lock`。不要使用 npm/yarn/pnpm 安装依赖。
- CI 工作流已切换为 `oven-sh/setup-bun`，禁止改回 `setup-node` + `npm ci`。

### IPC 模式

- 新增 Main ↔ Renderer 通信必须遵循 `src/ipc/<domain>/` 模式：`handlers.ts`（`os.handler()` 过程定义）→ `index.ts`（导出）→ `router.ts`（注册）→ `src/actions/<domain>.ts`（Renderer 侧封装）。
- 禁止在 Preload 脚本中暴露 Node.js API。`src/preload.ts` 只做 MessagePort 转发。
- Renderer 通过 `contextIsolation: true` 与 Node.js 完全隔离，所有后端操作必须走 oRPC IPC。

### Services 层

- `src/services/` 是与 `src/ipc/` **并列**的业务逻辑层，负责处理域逻辑、状态管理和外部服务编排。IPC handlers 只做参数校验和响应封装，**实际业务逻辑委托给 services**。
- 新增 service 遵循 `src/services/<domain>/` 模式，与 IPC 领域对齐：`index.ts`（导出分组）、`service.ts`（业务逻辑实现）。复杂领域可拆分为 `utils/` 子目录。
- **职责边界**：
  - IPC handlers（`src/ipc/<domain>/handlers.ts`）：接收请求、Zod 校验、调用 service、返回响应
  - Services（`src/services/<domain>/`）：执行业务逻辑、管理内部状态、编排外部依赖（Chat SDK、AcpClient 等）
  - 禁止 IPC handlers 直接调用外部 SDK 或 AcpClient——统一通过 services 封装

### 外部依赖边界

- 渠道协议适配、webhook 验签、消息格式化、SlashCommand 事件接收、Modal 交互、Reaction 处理由 **Chat SDK** 提供，AgentLink 不重新实现。线程订阅和 transcripts 消息历史由 Chat SDK 的 SQLite state adapter 持久化。
- Agent 执行由外部 **ACP Server** 完成，AgentLink 负责启动本地进程并管理生命周期。Session 管理、Permission 控制、Mode/Config 切换由 ACP 协议提供，AgentLink 仅做命令映射和 UI 渲染。

### TypeScript

- 当前已启用 `noUnusedLocals`、`noUnusedParameters`、`erasableSyntaxOnly`。不要放宽这些检查。
- 不要使用 `enum`、`namespace` 等不可擦除语法（`erasableSyntaxOnly` 会拒绝）。

### Electron 安全

- **密钥存储**：渠道凭证等敏感数据必须通过 `electron.safeStorage` 在主进程加密存储。禁止在 Renderer 的 `localStorage` 或 `sessionStorage` 中存放明文密钥。
- **URL 校验**：`shell.openExternal` 调用前必须校验 URL 协议为 `https:` 或 `http:`，拒绝 `file:`、`javascript:` 等危险协议。
- **CSP**：保留 `index.html` 中的 `Content-Security-Policy: script-src 'self'`。不要添加 `unsafe-eval` 或 `unsafe-inline`，除非有明确的安全评估和注释说明理由。
- **webSecurity**：生产环境禁止关闭 `webPreferences.webSecurity`。开发环境如有跨域调试需求，使用 Vite proxy 而非关闭安全策略。
- **主进程不阻塞**：CPU 密集或长时间计算不要在主进程同步执行。Agent 执行通过外部 ACP Server 完成，本地耗时操作使用 Worker 线程。
- **路径解析**：使用 `app.getPath('userData')` 等 Electron API 获取路径，不硬编码 `~/.agentlink` 或平台相关路径。
- **崩溃处理**：主进程应注册 `process.on('uncaughtException')` 和 `process.on('unhandledRejection')`，记录错误并尝试优雅降级，而不是静默退出。

### Commit

- 使用 Conventional Commits 格式：`type(scope): description`。CHANGELOG 由 git-cliff 根据 commit 自动生成。

### Worktree

- Worktree 统一创建在 `.worktrees/` 目录下。

## 编码原则

- **简洁优先，避免过度设计**。优先选择简单、可读、实用的方案，不为尚未出现的需求提前抽象。
- **控制复杂度**。函数和组件保持单一职责，圈复杂度高的代码拆分为小单元。提取可复用的工具函数和 hooks 到 `src/utils/` 或 `src/hooks/`。
- **模块化设计**。新领域代码参考 `src/ipc/` 的模块结构（`index.ts` + `handlers.ts` + `schemas.ts`）和 `src/services/` 的模块结构（`index.ts` + `service.ts`），保持一致的代码组织方式。

## 架构

### 进程模型

这是一个 **Electron + Vite + React** 桌面应用模板，包含三个编译目标：

| 目标 | 入口 | Vite 配置 | 说明 |
|------|------|-----------|------|
| `main` | `src/main.ts` | `vite.main.config.mts` | Electron 主进程 |
| `preload` | `src/preload.ts` | `vite.preload.config.mts` | Preload 脚本，启用 contextIsolation |
| `renderer` | `src/renderer.ts` → `src/app.tsx` | `vite.renderer.config.mts` | React UI |

Electron Forge 插件（`forge.config.ts`）在构建时协调这三个目标。全局常量 `MAIN_WINDOW_VITE_DEV_SERVER_URL` 和 `MAIN_WINDOW_VITE_NAME` 由 Forge 的 Vite 插件自动注入（在 `src/types.d.ts` 中声明）。

### IPC 层（oRPC）

主进程和渲染进程之间的通信使用 **oRPC**（而非 Electron 的原始 `ipcMain`/`ipcRenderer`）。它通过 `MessagePort` 工作：

1. **主进程**（`src/main.ts`）监听 `START_ORPC_SERVER` IPC 事件。当触发时，它从渲染进程接收一个 `MessagePort` 并在其上调用 `rpcHandler.upgrade(serverPort)`。
2. **Preload**（`src/preload.ts`）将 `MessagePort` 从渲染进程转发到主进程。
3. **渲染进程**（`src/ipc/manager.ts`）通过 `new MessageChannel()` 创建一个 `MessageChannel`，在客户端端口上启动一个 `RPCLink`，并通过 `window.postMessage` 将服务端端口发送给主进程。这会创建一个类型安全的 oRPC 客户端，作为 `ipc.client` 导出。
4. **IPC 路由器**（`src/ipc/router.ts`）将处理器组合到命名空间下：`theme`、`window`、`app`、`shell`。每个命名空间在 `src/ipc/<name>/` 下都有自己的目录，包含 `index.ts`（导出）和 `handlers.ts`（使用 `os.handler()` 的实现）。
5. **IPC 上下文**（`src/ipc/context.ts`）通过 oRPC middleware 使 `BrowserWindow` 实例可供处理器使用——需要窗口引用的处理器（例如，最小化/最大化）使用 `os.use(ipcContext.mainWindowContext)`。

**添加新的 IPC 端点：**

- 在 `src/ipc/<name>/handlers.ts` 中创建一个 `os.handler()`（可附带 Zod schema 使用 `os.input(schema)`）。
- 在 `src/ipc/<name>/index.ts` 中导出它。
- 在 `src/ipc/router.ts` 中将其添加到路由器。
- 在 `src/actions/<name>.ts` 中创建一个 action 包装器，供 React 组件在 UI 中调用。

### React 渲染进程

- **入口**：`src/app.tsx` 挂载 `<App />`，它同步主题和语言偏好，然后将 `<RouterProvider>` 与 TanStack Router 一起渲染。
- **路由**：基于文件的，位于 `src/routes/`。`__root.tsx` 是根布局（包裹在 `BaseLayout` 中）。文件由 TanStack Router Vite 插件自动生成到 `src/routeTree.gen.ts`（已自动生成，请勿手动编辑）。路由使用 `createMemoryHistory`（Electron 中无浏览器 URL）。
- **技能参考**：使用 TanStack Router 时，参考 **tanstack-router** 技能（`.claude/skills/tanstack-router/SKILL.md`）获取类型安全路由、搜索参数、数据加载等最佳实践。
- **Actions**（`src/actions/`）：封装 IPC 调用的普通函数，供 React 组件使用。每个文件对应一个 IPC 命名空间（`theme.ts`、`window.ts`、`app.ts`、`shell.ts`、`language.ts`）。
- **布局**：`src/layouts/base-layout.tsx` 包装所有路由，包含一个自定义标题栏（`DragWindowRegion`），在非 macOS 系统上显示窗口控制按钮，在 macOS 上定位红绿灯控件。
- **组件**：`src/components/` 中的自定义组件 + `src/components/ui/` 中的 shadcn/ui 组件。shadcn 组件被排除在 Biome lint 之外（参见 `biome.jsonc`）。
- **技能参考**：编写 React 组件时，参考 **react-best-practices** 技能（`.claude/skills/react-best-practices/SKILL.md`）获取渲染优化、性能模式、测试最佳实践等指导。
- **国际化**：i18next + react-i18next，支持英语和巴西葡萄牙语（`src/localization/`）。语言偏好持久化在 `localStorage` 中。

### 样式

- **Tailwind CSS 4** 配置通过 `@theme inline` 块在 `src/styles/global.css` 中进行。亮色/暗色主题 CSS 自定义属性在 `:root` 和 `.dark` 中定义。
- **Shadcn/ui** 使用 `base-nova` 样式，配置在 `components.json` 中。
- **Geist** 字体（无衬线和等宽变体）。
- 自定义 `draglayer` CSS 类启用窗口拖动区域（`-webkit-app-region: drag`）。
- `src/utils/tailwind.ts` 中的 `cn()` 工具函数使用 `clsx` + `tailwind-merge` 合并类名。

### 自动更新

主进程调用 `update-electron-app`（`src/main.ts` 中的 `checkForUpdates()`），配置为检查 `LuanRoger/agentlink` GitHub 仓库的发布版本。发布通过 Electron Forge 的 GitHub publisher（`forge.config.ts`）处理——版本来自 `package.json`，发布版本在 GitHub 上创建为草稿。

### 测试

- **单元测试**：`src/tests/unit/`，使用 Vitest + jsdom + React Testing Library。设置在 `src/tests/unit/setup.ts` 中（导入 `@testing-library/jest-dom`）。配置包含 V8 覆盖率。
- **E2E 测试**：`src/tests/e2e/`，使用 Playwright + `electron-playwright-helpers`。CI 在打包后通过 `xvfb-run` 运行（参见 `.github/workflows/testing.yaml`）。

### 打包目标

`forge.config.ts` 中的 makers 生成：Squirrel（Windows）、ZIP（macOS）、RPM 和 DEB（Linux）。asar 打包已启用。Electron Fuses 已配置：`RunAsNode` 已禁用，`CookieEncryption` 已启用，`AsarIntegrity` 已启用。
