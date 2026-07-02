# AGENTS.md

This file provides guidance to Code Agent when working with code in this repository.

## 项目概览

AgentLink 是一个 **AI Agent 桌面客户端**，通过 Chat SDK 接入多渠道消息平台，通过 ACP Server 驱动 Agent 执行，提供统一的会话管理和交互界面。

### 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron |
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite + Electron Forge |
| UI 系统 | Tailwind CSS 4 + shadcn/ui (base-nova) |
| 路由 | TanStack Router（基于文件的路由） |
| IPC 通信 | oRPC（基于 MessagePort 的类型安全 RPC） |
| 包管理器 | bun（锁文件 `bun.lock`） |
| 测试 | Vitest（单元测试）+ Playwright（E2E） |
| 图标 | lucide-react |

### 外部依赖

- **Chat SDK** — 提供渠道协议适配、webhook 验签、消息格式化、SlashCommand、Modal 交互、Reaction 处理、线程订阅和 transcripts 持久化（SQLite state adapter）。AgentLink 不重新实现这些能力。
- **ACP Server** — 提供 Agent 执行、Session 管理、Permission 控制、Mode/Config 切换。AgentLink 负责启动本地 ACP 进程并管理其生命周期，仅做命令映射和 UI 渲染。

## 开发命令

```bash
npm run start           # 启动 Electron 应用（开发模式）
npm run check-types     # 通过 TypeScript 运行类型检查
npm run fix             # 通过 Ultracite/Biome 自动修复 lint/格式化问题
npm run test:unit       # 运行 Vitest 单元测试（jsdom 环境）
npm run test:e2e        # 运行 Playwright E2E 测试（Electron + Chromium）
npm run test:all        # 顺序运行单元测试和 E2E 测试
npm run package         # 打包应用（不制作安装包）
npm run make            # 为当前平台创建可分发的安装包
npm run publish         # 在 GitHub Releases 上发布（会创建草稿版本）
npm run bump-ui         # 将 shadcn/ui 组件更新到最新版本
```

## 架构设计

### 进程模型

本项目包含三个编译目标，由 Electron Forge 插件（`forge.config.ts`）在构建时协调：

| 目标 | 入口 | Vite 配置 | 说明 |
|------|------|-----------|------|
| `main` | `src/main.ts` | `vite.main.config.mts` | Electron 主进程 |
| `preload` | `src/preload.ts` | `vite.preload.config.mts` | Preload 脚本，启用 contextIsolation |
| `renderer` | `src/renderer.ts` → `src/app.tsx` | `vite.renderer.config.mts` | React UI |

全局常量 `MAIN_WINDOW_VITE_DEV_SERVER_URL` 和 `MAIN_WINDOW_VITE_NAME` 由 Forge 的 Vite 插件自动注入（在 `src/types.d.ts` 中声明）。

### IPC 通信层（oRPC）

主进程和渲染进程之间的通信使用 **oRPC**（而非 Electron 的原始 `ipcMain`/`ipcRenderer`），通过 `MessagePort` 实现类型安全的 RPC 调用：

1. **主进程**（`src/main.ts`）监听 `START_ORPC_SERVER` IPC 事件，从渲染进程接收 `MessagePort`，在其上调用 `rpcHandler.upgrade(serverPort)`。
2. **Preload**（`src/preload.ts`）将 `MessagePort` 从渲染进程转发到主进程，不暴露任何 Node.js API。
3. **渲染进程**（`src/ipc/manager.ts`）通过 `new MessageChannel()` 创建 `MessageChannel`，在客户端端口上启动 `RPCLink`，通过 `window.postMessage` 将服务端端口发送给主进程，生成类型安全的 oRPC 客户端（导出为 `ipc.client`）。
4. **IPC 路由器**（`src/ipc/router.ts`）将处理器组合到命名空间下（`theme`、`window`、`app`、`shell` 等），每个命名空间在 `src/ipc/<name>/` 下自成一目录。
5. **IPC 上下文**（`src/ipc/context.ts`）通过 oRPC middleware 使 `BrowserWindow` 实例可供处理器使用——需要窗口引用的处理器（如最小化/最大化）使用 `os.use(ipcContext.mainWindowContext)`。

Renderer 通过 `contextIsolation: true` 与 Node.js 完全隔离，所有后端操作必须走 oRPC IPC。

### Services 层

`src/services/` 是与 `src/ipc/` **并列**的业务逻辑层，负责处理域逻辑、状态管理和外部服务编排。

**职责边界**：

| 层 | 文件 | 职责 |
|----|------|------|
| IPC handlers | `src/ipc/<domain>/handlers.ts` | 接收请求、Zod 校验、调用 service、返回响应 |
| Services | `src/services/<domain>/` | 执行业务逻辑、管理内部状态、编排外部依赖（Chat SDK、AcpClient 等） |

- IPC handlers 只做薄层——参数校验和响应封装，实际业务逻辑委托给 services。
- Services 是外部 SDK 和 AcpClient 的**唯一调用入口**，禁止 IPC handlers 直接调用外部 SDK 或 AcpClient。

### React 渲染进程

- **入口**：`src/app.tsx` 挂载 `<App />`，同步主题和语言偏好，然后将 `<RouterProvider>` 与 TanStack Router 一起渲染。
- **路由**：基于文件的，位于 `src/routes/`。`__root.tsx` 是根布局（包裹在 `BaseLayout` 中）。路由文件由 TanStack Router Vite 插件自动生成到 `src/routeTree.gen.ts`。路由使用 `createMemoryHistory`（Electron 中无浏览器 URL）。
- **技能参考**：使用 TanStack Router 时，参考 **tanstack-router** 技能（`.agents/skills/tanstack-router/SKILL.md`）获取类型安全路由、搜索参数、数据加载等最佳实践。
- **Actions**（`src/actions/`）：封装 IPC 调用的普通函数，供 React 组件使用。每个文件对应一个 IPC 命名空间（`theme.ts`、`window.ts`、`app.ts`、`shell.ts`、`language.ts`）。
- **布局**：`src/layouts/base-layout.tsx` 包装所有路由，包含自定义标题栏（`DragWindowRegion`），在非 macOS 系统上显示窗口控制按钮，在 macOS 上定位红绿灯控件。
- **组件**：`src/components/` 中的自定义组件 + `src/components/ui/` 中的 shadcn/ui 组件。shadcn 组件被排除在 Biome lint 之外（参见 `biome.jsonc`）。
- **技能参考**：编写 React 组件时，参考 **react-best-practices** 技能（`.agents/skills/react-best-practices/SKILL.md`）获取渲染优化、性能模式、测试最佳实践等指导。
- **国际化**：i18next + react-i18next，支持英语和简体中文（`src/localization/`）。语言偏好持久化在 `localStorage` 中。

### 样式系统

- **Tailwind CSS 4** 配置通过 `@theme inline` 块在 `src/styles/global.css` 中进行。亮色/暗色主题 CSS 自定义属性在 `:root` 和 `.dark` 中定义。
- **Shadcn/ui** 使用 `base-nova` 样式，配置在 `components.json` 中。
- **Geist** 字体（无衬线和等宽变体）。
- 自定义 `draglayer` CSS 类启用窗口拖动区域（`-webkit-app-region: drag`）。
- `src/utils/tailwind.ts` 中的 `cn()` 工具函数使用 `clsx` + `tailwind-merge` 合并类名。

### 测试

- **单元测试**：`src/tests/unit/`，使用 Vitest + jsdom + React Testing Library。设置在 `src/tests/unit/setup.ts` 中（导入 `@testing-library/jest-dom`）。配置包含 V8 覆盖率。
- **E2E 测试**：`src/tests/e2e/`，使用 Playwright + `electron-playwright-helpers`。CI 在打包后通过 `xvfb-run` 运行（参见 `.github/workflows/testing.yaml`）。

### 自动更新

主进程调用 `update-electron-app`（`src/main.ts` 中的 `checkForUpdates()`），配置为检查 `LuanRoger/agentlink` GitHub 仓库的发布版本。发布通过 Electron Forge 的 GitHub publisher（`forge.config.ts`）处理——版本来自 `package.json`，发布版本在 GitHub 上创建为草稿。

### 打包目标

`forge.config.ts` 中的 makers 生成：Squirrel（Windows）、ZIP（macOS）、RPM 和 DEB（Linux）。asar 打包已启用。Electron Fuses 已配置：`RunAsNode` 已禁用，`CookieEncryption` 已启用，`AsarIntegrity` 已启用。

## 项目约束

以下规则为**硬性红线**，违反将导致构建失败、安全漏洞或架构腐化。

### 不可修改的目录

- **`src/components/ui/`** — shadcn/ui 组件，由 `bun run bump-ui` 自动生成。禁止手动编辑。
- **`src/components/ai-elements/`** — AI Elements 组件库。禁止手动编辑。
- **`src/routeTree.gen.ts`** — TanStack Router 自动生成的路由树。禁止手动编辑。

### 包管理器

- 项目使用 **bun** 作为包管理器，锁文件为 `bun.lock`。不要使用 npm/yarn/pnpm 安装依赖。
- CI 工作流已切换为 `oven-sh/setup-bun`，禁止改回 `setup-node` + `npm ci`。

### TypeScript

- 当前已启用 `noUnusedLocals`、`noUnusedParameters`、`erasableSyntaxOnly`。不要放宽这些检查。
- 不要使用 `enum`、`namespace` 等不可擦除语法（`erasableSyntaxOnly` 会拒绝）。替代方案：`enum` → `const` 对象 + 类型推导，`namespace` → ES 模块。

### 样式

- 视觉样式（颜色、背景、边框、阴影、字体大小等）统一使用 shadcn/ui 组件和 Tailwind 主题系统（`src/styles/global.css` 中的 CSS 自定义属性）提供的设计 Token。禁止在自定义 CSS class 中新增颜色值或自定义视觉属性。
- 新增自定义 CSS class 仅用于排版布局（如 flex、grid、间距、定位、尺寸等结构性样式）。

### 图标

- 图标统一使用 `lucide-react` 组件（如 `<X />`、`<Menu />`），禁止内联 `<svg>`、导入 SVG 文件或使用其他图标库。（`WindowButtons` 组件中的 Windows 平台图标除外）

### Electron 安全

- **密钥存储**：渠道凭证等敏感数据必须通过 `electron.safeStorage` 在主进程加密存储。禁止在 Renderer 的 `localStorage` 或 `sessionStorage` 中存放明文密钥。
- **URL 校验**：`shell.openExternal` 调用前必须校验 URL 协议为 `https:` 或 `http:`，拒绝 `file:`、`javascript:` 等危险协议。
- **CSP**：保留 `index.html` 中的 `Content-Security-Policy: script-src 'self'`。不要添加 `unsafe-eval` 或 `unsafe-inline`，除非有明确的安全评估和注释说明理由。
- **webSecurity**：生产环境禁止关闭 `webPreferences.webSecurity`。开发环境如有跨域调试需求，使用 Vite proxy 而非关闭安全策略。
- **主进程不阻塞**：CPU 密集或长时间计算不要在主进程同步执行。Agent 执行通过外部 ACP Server 完成，本地耗时操作使用 Worker 线程。
- **路径解析**：使用 `app.getPath('userData')` 等 Electron API 获取路径，不硬编码 `~/.agentlink` 或平台相关路径。
- **崩溃处理**：主进程应注册 `process.on('uncaughtException')` 和 `process.on('unhandledRejection')`，记录错误并尝试优雅降级，而非静默退出。

### 外部依赖

- 禁止绕过 Chat SDK 重新实现渠道协议适配、webhook 验签、消息格式化等能力。
- 禁止绕过 ACP Server 直接执行 Agent 或管理 Session/Permission。

## 开发约定

以下为**推荐做法**，不遵守不会导致构建失败，但会导致代码库不一致。

### IPC 端点开发

新增 Main ↔ Renderer 通信端点时，遵循以下流程：

```
handlers.ts（os.handler() 过程定义）→ index.ts（导出）→ router.ts（注册）→ src/actions/<domain>.ts（Renderer 侧封装）
```

1. 在 `src/ipc/<name>/handlers.ts` 中创建一个 `os.handler()`（可附带 Zod schema 使用 `os.input(schema)`）。
2. 在 `src/ipc/<name>/index.ts` 中导出。
3. 在 `src/ipc/router.ts` 中将其添加到路由器。
4. 在 `src/actions/<name>.ts` 中创建 action 包装器，供 React 组件调用。

### Service 开发

新增 service 遵循 `src/services/<domain>/` 模式，与 IPC 领域对齐：

```
src/services/<domain>/
├── index.ts          # 导出分组
├── service.ts        # 业务逻辑实现
└── utils/            # （可选）复杂领域拆分子模块
```

### 代码组织

- 提取可复用的工具函数到 `src/utils/`。
- 提取可复用的 hooks 到 `src/hooks/`。
- 新领域代码参考 `src/ipc/` 的模块结构（`index.ts` + `handlers.ts` + `schemas.ts`）和 `src/services/` 的模块结构（`index.ts` + `service.ts`），保持一致的代码组织方式。

## Agent Coding规范

### 沟通原则

- 所有回复必须使用简体中文，专业名词除外
- 遵循金字塔原理：先结论后论据，先全局后细节，先结果后过程
- 结构化表达时，按互斥且穷尽（MECE）的方式分组，避免内容交叉、重复和跳跃
- 撰写 Issue、PR 等说明性内容时，按如下顺序组织：目的/结论 → 背景 → 方案或改动点 → 影响与风险 → 验收或验证结果
- 如果当前讨论的原始内容结构混乱，主动按金字塔原理重组后再输出

### 思考与流程

- 先输出分析计划，列出关键假设、不确定性和风险点，获得确认后再动手编码
- 多步任务先给出计划清单，每步挂一个验证点（改完就跑测试/构建/看输出），逐条验证通过
- 描述任务目标时用可验证语句。反例：「修个 bug」；正例：「先写一个能复现 bug 的测试，再修代码让测试变绿」
- 给出明确的成功标准，允许 Agent 循环自检直到达标，减少一步一停的低效交互
- 遇歧义时列出几种理解让用户选择，不替用户做假设
- 涉及以下场景必须确认后再执行：架构级决策、破坏性变更、数据安全、依赖引入或升级
- 发现可复用的现成轮子或更省事的替代方案，主动提醒
- 预判技术债、复杂度和长期维护成本，提前说明取舍
- 交付前自检：这段逻辑是否绕了远路？是就砍到最简

### 编码与架构原则

- 分析问题、技术架构和代码模块组合时遵循第一性原理
- 编码时遵循 DRY、KISS、SOLID、YAGNI 原则：
  - YAGNI（You Aren't Gonna Need It）：一次性代码不做抽象，不为根本不会发生的场景兜错，需求没点名的特性、灵活性、可配置项一概不加
- 控制复杂度：函数和组件保持单一职责，圈复杂度高的代码拆分为小单元
- 文件与函数的层级拆分边界：
  - 单个类或模块文件不超过 500 行，超过时必须分解为多个文件
  - 拆分过程中遵循以上编码原则，优先按单一职责切分

### 代码风格

- 遵循项目现有约定和代码风格，保持与周边代码一致
- 使用有意义的变量名和函数名，命名即文档
- 仅对复杂逻辑或非显而易见的设计意图添加注释；避免显而易见的注释

### 极简与精准修改

- 能 50 行搞定不写 200 行
- 每一行 diff 都必须能对到具体的需求条目，不属于本次需求的代码不写
- 改动范围紧贴需求，不向外扩展；只碰非改不可的地方
- 不顺手"美化"无关代码、注释或格式；不主动重构没坏的代码
- 改动留下的孤儿导入、变量、函数要顺手清干净
- 撞见无关的死代码：只提醒不删，不在本次改动中处理

### 测试

- 修改代码后必须运行现有测试套件，确保不引入回归
- 新增业务逻辑和关键路径功能必须包含对应的测试用例；纯视觉调整和一次性脚本可豁免
- Bug 修复流程：先写一个能复现问题的最小测试 → 确认测试失败 → 修代码 → 确认测试通过
- 测试应覆盖正常路径、边界条件和异常路径
- 当项目无测试框架时，评估后提出引入建议，不跳过

### 安全规范

- 禁止硬编码密钥、API Key、密码等敏感信息，统一使用环境变量或配置中心
- 对所有外部输入进行校验和消毒，不信任任何来自用户、API 或第三方的输入
- 错误必须显式处理并记录日志，返回可操作的错误信息，禁止静默失败或吞异常

### 依赖管理

- 遵循项目现有包管理工具，不引入新的包管理器
- 引入新依赖前评估必要性、体积、维护活跃度和许可证兼容性

### Git 工作流

- 采用 GitHub Flow：main 为默认稳定分支，所有功能/修复分支均从 main 拉出并通过 PR 合并回 main
- 禁止直接提交到 main，禁止向 main 强制推送（force push）
- Commit 遵循 Conventional Commits 规范：feat / fix / refactor / docs / test / chore，格式：`type(scope): description`
- 保持原子提交，一个 Commit 只解决一个关注点
- 并行开发时使用 `git worktree` 隔离工作目录，避免频繁 stash 或切换分支导致的状态污染

### 灵活裁量

- 以上规范整体偏稳不偏快，适用于有规模的改动
- 琐碎改动（错别字、一行显而易见的小修、格式修正）自行放宽，不必硬套全流程
- 当用户指令与最佳实践冲突时，主动提醒并说明取舍建议
