import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type EventCallback = (event: unknown) => void;
let capturedCallback: EventCallback | null = null;

vi.mock("@/hooks/use-event-stream", () => ({
  useEventStream: (cb: EventCallback) => {
    capturedCallback = cb;
  },
}));

import { useStreamingMessage } from "@/hooks/use-streaming-message";

function emit(event: Record<string, unknown>) {
  act(() => {
    capturedCallback?.(event);
  });
}

beforeEach(() => {
  capturedCallback = null;
});

describe("useStreamingMessage", () => {
  it("starts in idle state", () => {
    const { result } = renderHook(() => useStreamingMessage("t1"));
    expect(result.current).toEqual({
      error: null,
      isStreaming: false,
      isThinking: false,
      text: "",
    });
  });

  it("transitions to isThinking on message_received", () => {
    const { result } = renderHook(() => useStreamingMessage("t1"));
    emit({
      adapter: "telegram",
      message: {
        authorName: "u",
        channelName: "t",
        isMention: true,
        text: "hi",
      },
      threadId: "t1",
      type: "message_received",
    });
    expect(result.current).toMatchObject({
      isStreaming: true,
      isThinking: true,
      text: "",
    });
  });

  it("ignores events for other threadIds", () => {
    const { result } = renderHook(() => useStreamingMessage("t1"));
    emit({
      adapter: "telegram",
      message: {
        authorName: "u",
        channelName: "t",
        isMention: true,
        text: "hi",
      },
      threadId: "t2",
      type: "message_received",
    });
    expect(result.current.isStreaming).toBe(false);
  });

  it("accumulates text on acp_session_update", () => {
    const { result } = renderHook(() => useStreamingMessage("t1"));
    emit({
      adapter: "telegram",
      message: {
        authorName: "u",
        channelName: "t",
        isMention: true,
        text: "hi",
      },
      threadId: "t1",
      type: "message_received",
    });
    emit({
      sessionId: "s1",
      text: "Hello",
      threadId: "t1",
      type: "acp_session_update",
    });
    emit({
      sessionId: "s1",
      text: " World",
      threadId: "t1",
      type: "acp_session_update",
    });
    expect(result.current).toMatchObject({
      isStreaming: true,
      isThinking: false,
      text: "Hello World",
    });
  });

  it("resets to idle on message_sent", () => {
    const { result } = renderHook(() => useStreamingMessage("t1"));
    emit({
      adapter: "telegram",
      message: {
        authorName: "u",
        channelName: "t",
        isMention: true,
        text: "hi",
      },
      threadId: "t1",
      type: "message_received",
    });
    emit({
      sessionId: "s1",
      text: "Hello",
      threadId: "t1",
      type: "acp_session_update",
    });
    emit({
      adapter: "telegram",
      text: "Hello",
      threadId: "t1",
      type: "message_sent",
    });
    expect(result.current).toMatchObject({
      isStreaming: false,
      isThinking: false,
      text: "",
    });
  });

  it("captures error on agent_error and resets", () => {
    const { result } = renderHook(() => useStreamingMessage("t1"));
    emit({
      adapter: "telegram",
      error: "ACP connection failed",
      threadId: "t1",
      type: "agent_error",
    });
    expect(result.current).toMatchObject({
      error: "ACP connection failed",
      isStreaming: false,
      isThinking: false,
      text: "",
    });
  });

  it("resets state when threadId changes", () => {
    const { result, rerender } = renderHook(
      (id: string) => useStreamingMessage(id),
      { initialProps: "t1" }
    );
    emit({
      adapter: "telegram",
      message: {
        authorName: "u",
        channelName: "t",
        isMention: true,
        text: "hi",
      },
      threadId: "t1",
      type: "message_received",
    });
    rerender("t2");
    expect(result.current).toMatchObject({
      isStreaming: false,
      isThinking: false,
      text: "",
    });
  });
});
