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
      status: string;
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
      status: string;
      error?: string;
    }
  | { type: "agent_error"; threadId: string; adapter: string; error: string };
