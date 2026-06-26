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
- **Actions**（`src/actions/`）：封装 IPC 调用的普通函数，供 React 组件使用。每个文件对应一个 IPC 命名空间（`theme.ts`、`window.ts`、`app.ts`、`shell.ts`、`language.ts`）。
- **布局**：`src/layouts/base-layout.tsx` 包装所有路由，包含一个自定义标题栏（`DragWindowRegion`），在非 macOS 系统上显示窗口控制按钮，在 macOS 上定位红绿灯控件。
- **组件**：`src/components/` 中的自定义组件 + `src/components/ui/` 中的 shadcn/ui 组件。shadcn 组件被排除在 Biome lint 之外（参见 `biome.jsonc`）。
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
