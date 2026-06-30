import { AcpService } from "./acp";
import { AdapterRegistry, ChatService, EventBridge } from "./chat";

export interface AppServices {
  acpService: AcpService;
  chatService: ChatService;
  eventBridge: EventBridge;
}

export async function bootstrapServices(): Promise<AppServices> {
  const eventBridge = new EventBridge();
  const registry = new AdapterRegistry();
  const chatService = new ChatService(registry, eventBridge);
  const acpService = new AcpService();

  // Collect ACP chunks per thread, then post when turn completes
  const pendingReplies = new Map<string, string[]>();

  acpService.setChunkHandler(async (threadId: string, text: string) => {
    const chunks = pendingReplies.get(threadId);
    if (chunks) {
      chunks.push(text);
    }
    eventBridge.emit({
      type: "acp_session_update",
      sessionId: "",
      threadId,
      text,
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
        serverId,
        threadId: thread.id,
        prompt: message.text,
      });

      // 发送收集到的回复
      const chunks = pendingReplies.get(thread.id);
      if (chunks && chunks.length > 0) {
        const reply = chunks.join("");
        await thread.post(reply);
        eventBridge.emit({
          type: "message_sent",
          threadId: thread.id,
          adapter: thread.channel.name ?? "unknown",
          text: reply,
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

  // Auto-connect configured ACP Servers
  for (const server of acpService.getServers()) {
    try {
      await acpService.connect(server.id);
    } catch (err) {
      console.error(
        `[bootstrap] Failed to connect ACP server "${server.id}":`,
        err
      );
    }
  }

  // Register event collector if available (created in Task 6)
  try {
    const { registerEventCollector } = await import("@/ipc/events");
    registerEventCollector();
  } catch {
    console.log("[bootstrap] Event collector not available, skipping");
  }

  return { chatService, acpService, eventBridge };
}
