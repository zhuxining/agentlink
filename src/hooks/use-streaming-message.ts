// src/hooks/use-streaming-message.ts
import { useEffect, useState } from "react";
import { useEventStream } from "@/hooks/use-event-stream";
import type { AppEvent } from "@/ipc/events/event-types";

export interface StreamingMessageState {
  error: string | null;
  isStreaming: boolean;
  isThinking: boolean;
  text: string;
}

const IDLE: StreamingMessageState = {
  error: null,
  isStreaming: false,
  isThinking: false,
  text: "",
};

/**
 * Tracks the in-flight streaming agent reply for a given thread.
 *
 * State machine:
 *   message_received      -> isThinking=true (waiting for first chunk)
 *   acp_session_update    -> isThinking=false, text accumulates
 *   message_sent          -> reset to idle (transcript takes over)
 *   agent_error           -> error set, reset to idle
 */
export function useStreamingMessage(threadId: string): StreamingMessageState {
  const [state, setState] = useState<StreamingMessageState>(IDLE);

  // Reset when the viewed conversation changes
  useEffect(() => {
    setState(IDLE);
  }, [threadId]);

  useEventStream((event: AppEvent) => {
    if (!("threadId" in event) || event.threadId !== threadId) {
      return;
    }
    if (event.type === "message_received") {
      setState({ error: null, isStreaming: true, isThinking: true, text: "" });
    } else if (event.type === "acp_session_update") {
      setState((prev) => ({
        error: null,
        isStreaming: true,
        isThinking: false,
        text: prev.text + event.text,
      }));
    } else if (event.type === "message_sent") {
      setState(IDLE);
    } else if (event.type === "agent_error") {
      setState({ ...IDLE, error: event.error });
    }
  });

  return state;
}
