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

  // Map threadId → thread so the chunk handler can stream text back to IM.
  const activeThreads = new Map<
    string,
    { stream(content: unknown): Promise<unknown> }
  >();

  // Wire AcpService chunks → IM thread streaming + event emission
  acpService.setChunkHandler(async (threadId: string, text: string) => {
    eventBridge.emit({
      type: "acp_session_update",
      sessionId: "",
      threadId,
      text,
    });
    const thread = activeThreads.get(threadId);
    if (thread) {
      try {
        await thread.stream(text);
      } catch (err) {
        console.error("[bootstrap] stream error:", err);
      }
    }
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
    activeThreads.set(thread.id, thread);
    try {
      await acpService.sendPrompt({
        serverId,
        threadId: thread.id,
        prompt: message.text,
      });
    } finally {
      activeThreads.delete(thread.id);
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
