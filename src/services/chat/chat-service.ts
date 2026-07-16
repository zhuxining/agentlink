import { Chat } from "chat";
import { createStateAdapter, getDatabase } from "@/services/persistence";
import type { AdapterEntry, AdapterRegistry } from "./adapter-registry";
import type { EventBridge } from "./event-bridge";

export type ChatMessageHandler = (ctx: {
  thread: {
    id: string;
    channel: { name: string | null };
    post: (content: unknown) => Promise<unknown>;
    subscribe: () => Promise<void>;
  };
  message: { text: string; author: { fullName: string }; isMention?: boolean };
  /** Persist an agent reply as a transcript. */
  saveAgentReply: (text: string) => void;
}) => Promise<void>;

export class ChatService {
  private chat: Chat | null = null;
  private handler: ChatMessageHandler | null = null;
  private readonly registry: AdapterRegistry;
  private readonly eventBridge: EventBridge;

  constructor(registry: AdapterRegistry, eventBridge: EventBridge) {
    this.registry = registry;
    this.eventBridge = eventBridge;
  }

  onMessage(handler: ChatMessageHandler): void {
    this.handler = handler;
  }

  getChat(): Chat | null {
    return this.chat;
  }
  getAdapters(): AdapterEntry[] {
    return this.registry.list();
  }
  getEnabledAdapters(): AdapterEntry[] {
    return this.registry.getEnabled();
  }

  async enableAdapter(
    slug: string,
    env: Record<string, string>
  ): Promise<void> {
    await this.registry.enable(slug, env);
    this.eventBridge.emit({
      adapter: slug,
      status: "connecting",
      type: "adapter_status_changed",
    });
    await this.rebuild();
  }

  async disableAdapter(slug: string): Promise<void> {
    await this.registry.disable(slug);
    this.eventBridge.emit({
      adapter: slug,
      status: "disconnected",
      type: "adapter_status_changed",
    });
    await this.rebuild();
  }

  async initialize(): Promise<void> {
    try {
      await this.doInitialize();
    } catch (err) {
      console.error("[ChatService] Initialize failed:", err);
    }
  }

  private async doInitialize(): Promise<void> {
    const adapters = await this.registry.buildAdapterMap();
    if (Object.keys(adapters).length === 0) {
      console.log("[ChatService] No adapters enabled");
      return;
    }
    this.chat = new Chat({
      adapters,
      state: createStateAdapter(),
      userName: "AgentLink",
    });
    try {
      this.registerHandlers();
      await this.chat.initialize();
      console.log("[ChatService] Initialized");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[ChatService] chat.initialize() failed:", err);
      // Attempt cleanup of partially-initialized Chat instance
      try {
        await this.chat.shutdown();
      } catch {
        // ignore shutdown errors during failed init
      }
      this.chat = null;
      // Mark all enabled adapters as error
      for (const a of this.registry.getEnabled()) {
        this.registry.setStatus(a.slug, "error", message);
        this.eventBridge.emit({
          adapter: a.slug,
          error: message,
          status: "error",
          type: "adapter_status_changed",
        });
      }
      return;
    }
    // Mark successfully initialized adapters as connected
    for (const slug of Object.keys(adapters)) {
      this.registry.setStatus(slug, "connected");
      this.eventBridge.emit({
        adapter: slug,
        status: "connected",
        type: "adapter_status_changed",
      });
    }
  }

  async shutdown(): Promise<void> {
    if (this.chat) {
      await this.chat.shutdown();
      this.chat = null;
    }
  }

  private async rebuild(): Promise<void> {
    await this.shutdown();
    await this.initialize();
  }

  private registerHandlers(): void {
    const { chat } = this;
    if (!chat) {
      return;
    }

    const processMessage = async (
      thread: {
        id: string;
        channel: { name: string | null };
        post: (c: unknown) => Promise<unknown>;
        subscribe: () => Promise<void>;
      },
      message: {
        text: string;
        author: { fullName: string };
        isMention?: boolean;
      }
    ) => {
      const adapter = thread.channel.name ?? "unknown";
      this.eventBridge.emit({
        adapter,
        message: {
          authorName: message.author.fullName,
          channelName: thread.channel.name,
          isMention: message.isMention ?? false,
          text: message.text,
        },
        threadId: thread.id,
        type: "message_received",
      });
      this.saveTranscript(thread.id, adapter, "user", message.text);
      if (this.handler) {
        try {
          await this.handler({
            message,
            saveAgentReply: (text: string) =>
              this.saveTranscript(thread.id, adapter, "agent", text),
            thread,
          });
        } catch (err) {
          console.error("[ChatService] Handler error:", err);
          this.eventBridge.emit({
            adapter,
            error: err instanceof Error ? err.message : String(err),
            threadId: thread.id,
            type: "agent_error",
          });
        }
      }
    };

    chat.onNewMention(async (thread, message) => {
      await processMessage(thread, message);
    });
    chat.onDirectMessage(async (thread, message) => {
      await processMessage(thread, message);
    });
    chat.onSubscribedMessage(async (thread, message) => {
      if (message.isMention) {
        await processMessage(thread, message);
      }
    });
  }

  private saveTranscript(
    convId: string,
    adapter: string,
    role: "user" | "agent",
    content: string
  ): void {
    try {
      const db = getDatabase();
      db.prepare(
        "INSERT INTO conversations (id, adapter, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at"
      ).run(convId, adapter, "", Date.now(), Date.now());
      db.prepare(
        "INSERT INTO transcripts (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)"
      ).run(convId, role, content, Date.now());
    } catch (e) {
      console.error("[ChatService] Transcript save error:", e);
    }
  }
}
