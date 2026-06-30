import type { AdapterEntry } from "./adapter-registry";

export type AppEvent =
  | {
      type: "message_received";
      threadId: string;
      adapter: string;
      message: {
        text: string;
        authorName: string;
        channelName: string | null;
        isMention: boolean;
      };
    }
  | { type: "message_sent"; threadId: string; adapter: string; text: string }
  | {
      type: "adapter_status_changed";
      adapter: string;
      status: AdapterEntry["status"];
      error?: string;
    }
  | {
      type: "acp_session_update";
      sessionId: string;
      threadId: string;
      text: string;
    }
  | {
      type: "acp_server_status_changed";
      serverId: string;
      status: "connecting" | "connected" | "disconnected" | "error";
      error?: string;
    }
  | { type: "agent_error"; threadId: string; adapter: string; error: string };

type Handler = (event: AppEvent) => void;

export class EventBridge {
  private readonly handlers = new Set<Handler>();
  emit(event: AppEvent): void {
    for (const h of this.handlers) {
      try {
        h(event);
      } catch (e) {
        console.error("[EventBridge]", e);
      }
    }
  }
  onEvent(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}
