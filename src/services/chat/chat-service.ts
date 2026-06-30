import { Chat } from "chat";
import { createStateAdapter, getDatabase } from "@/services/persistence";
import type { AdapterEntry, AdapterRegistry } from "./adapter-registry";
import type { EventBridge } from "./event-bridge";

export type ChatMessageHandler = (ctx: {
  thread: {
    id: string;
    channel: { name: string };
    post: (content: unknown) => Promise<unknown>;
    stream: (content: unknown) => Promise<unknown>;
    subscribe: () => Promise<void>;
  };
  message: { text: string; author: { fullName: string }; isMention: boolean };
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
      type: "adapter_status_changed",
      adapter: slug,
      status: "connecting",
    });
    await this.rebuild();
  }

  async disableAdapter(slug: string): Promise<void> {
    await this.registry.disable(slug);
    this.eventBridge.emit({
      type: "adapter_status_changed",
      adapter: slug,
      status: "disconnected",
    });
    await this.rebuild();
  }

  async initialize(): Promise<void> {
    const adapters = this.registry.buildAdapterMap();
    if (Object.keys(adapters).length === 0) {
      console.log("[ChatService] No adapters enabled");
      return;
    }
    this.chat = new Chat({
      adapters,
      state: createStateAdapter(),
      userName: "AgentLink",
    });
    this.registerHandlers();
    await this.chat.initialize();
    console.log("[ChatService] Initialized");
    for (const a of this.registry.getEnabled()) {
      this.eventBridge.emit({
        type: "adapter_status_changed",
        adapter: a.slug,
        status: "connected",
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
    const chat = this.chat;
    if (!chat) {
      return;
    }

    const processMessage = async (
      thread: {
        id: string;
        channel: { name: string };
        post: (c: unknown) => Promise<unknown>;
        stream: (c: unknown) => Promise<unknown>;
        subscribe: () => Promise<void>;
      },
      message: {
        text: string;
        author: { fullName: string };
        isMention: boolean;
      }
    ) => {
      const adapter = thread.channel.name ?? "unknown";
      this.eventBridge.emit({
        type: "message_received",
        threadId: thread.id,
        adapter,
        message: {
          text: message.text,
          authorName: message.author.fullName,
          channelName: thread.channel.name,
          isMention: message.isMention,
        },
      });
      this.saveTranscript(thread.id, adapter, "user", message.text);
      if (this.handler) {
        try {
          await this.handler({ thread, message });
        } catch (err) {
          console.error("[ChatService] Handler error:", err);
          this.eventBridge.emit({
            type: "agent_error",
            threadId: thread.id,
            adapter,
            error: err instanceof Error ? err.message : String(err),
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
