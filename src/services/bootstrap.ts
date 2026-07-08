import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AcpService } from "./acp";
import { AdapterRegistry, ChatService, EventBridge } from "./chat";

const WHITESPACE_RE = /\s+/;

export interface AppServices {
  acpService: AcpService;
  chatService: ChatService;
  eventBridge: EventBridge;
}

/** 从 .env.dev 读取开发环境配置 */
function loadDevConfig(): {
  adapters: Record<string, { env: Record<string, string> }>;
  acpServers: Array<{
    id: string;
    name: string;
    command: string;
    args: string[];
  }>;
} | null {
  const envPath = join(process.cwd(), ".env.dev");
  if (!existsSync(envPath)) {
    return null;
  }

  const content = readFileSync(envPath, "utf-8");
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  if (!vars.AGENTLINK_DEV) {
    return null;
  }

  const config: ReturnType<typeof loadDevConfig> = {
    acpServers: [],
    adapters: {},
  };

  if (vars.LARK_APP_ID && vars.LARK_APP_SECRET) {
    config.adapters.lark = {
      env: {
        LARK_APP_ID: vars.LARK_APP_ID,
        LARK_APP_SECRET: vars.LARK_APP_SECRET,
      },
    };
  }
  if (vars.ACP_SERVER_PI_COMMAND && vars.ACP_SERVER_PI_ARGS) {
    config.acpServers?.push({
      args: vars.ACP_SERVER_PI_ARGS.split(WHITESPACE_RE).filter(Boolean),
      command: vars.ACP_SERVER_PI_COMMAND,
      id: "pi",
      name: "PI Agent",
    });
  }

  return config;
}

export async function bootstrapServices(): Promise<AppServices> {
  const eventBridge = new EventBridge();
  const registry = new AdapterRegistry();
  const chatService = new ChatService(registry, eventBridge);
  const acpService = new AcpService();

  // Wire ACP status changes to the event bridge so the UI can react.
  acpService.setEventHandler((event) => {
    eventBridge.emit(event);
  });

  // 尝试加载 .env.dev 开发配置（仅在 configStore 为空时加载）
  const dev = loadDevConfig();
  if (dev) {
    const existingServers = acpService.getServers();
    const existingAdapters = registry.list().filter((a) => a.enabled);
    if (existingServers.length === 0 && existingAdapters.length === 0) {
      console.log("[dev] Loading dev config from .env.dev");
      // biome-ignore lint/suspicious/noUnnecessaryConditions: adapters is a Record, lark key may be absent at runtime
      if (dev.adapters.lark) {
        await registry.enable("lark", dev.adapters.lark.env);
      }
      for (const srv of dev.acpServers) {
        acpService.addServer(srv);
      }
    } else {
      console.log("[dev] Config already initialized, skipping .env.dev");
    }
  }

  // Collect ACP chunks per thread, then post when turn completes
  const pendingReplies = new Map<string, string[]>();

  acpService.setChunkHandler((threadId: string, text: string) => {
    const chunks = pendingReplies.get(threadId);
    if (chunks) {
      chunks.push(text);
    }
    eventBridge.emit({
      sessionId: "",
      text,
      threadId,
      type: "acp_session_update",
    });
  });

  // Wire ChatService messages → ACP Server
  chatService.onMessage(async ({ thread, message }) => {
    // Phase 1: use the first configured ACP Server
    const servers = acpService.getServers();
    if (servers.length === 0) {
      await thread.post("未配置 ACP Server，请在设置中添加。");
      return;
    }

    const serverId = servers[0].id;
    pendingReplies.set(thread.id, []);
    try {
      await acpService.sendPrompt({
        prompt: message.text,
        serverId,
        threadId: thread.id,
      });

      // 发送收集到的回复
      const chunks = pendingReplies.get(thread.id);
      if (chunks && chunks.length > 0) {
        const reply = chunks.join("");
        await thread.post(reply);
        eventBridge.emit({
          adapter: thread.channel.name ?? "unknown",
          text: reply,
          threadId: thread.id,
          type: "message_sent",
        });
      } else {
        await thread.post("（ACP Agent 未返回响应）");
      }
    } catch (err) {
      await thread.post(
        `Error: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      pendingReplies.delete(thread.id);
    }
  });

  // Initialize ChatService (starts enabled adapters)
  await chatService.initialize();

  // Auto-connect configured ACP Servers (parallel for faster startup)
  await Promise.all(
    acpService.getServers().map((server) =>
      acpService.connect(server.id).catch((err) => {
        console.error(
          `[bootstrap] Failed to connect ACP server "${server.id}":`,
          err
        );
      })
    )
  );

  return { acpService, chatService, eventBridge };
}
