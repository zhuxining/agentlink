// src/utils/message-merge.ts
import type { Transcript } from "@/ipc/conversation/schemas";

export interface StreamingMessage {
  text: string;
  isThinking: boolean;
}

export type MergedMessage = Transcript & { isThinking?: boolean };

/**
 * Merge persisted history with an in-flight streaming agent message.
 * The streaming message is appended after history (it's the latest).
 */
export function mergeMessages(
  history: Transcript[],
  streaming: StreamingMessage | null
): MergedMessage[] {
  if (!streaming) {
    return history;
  }
  const placeholder: MergedMessage = {
    content: streaming.text,
    conversationId: "",
    createdAt: Date.now(),
    id: -1,
    isThinking: streaming.isThinking,
    role: "agent",
  };
  return [...history, placeholder];
}
