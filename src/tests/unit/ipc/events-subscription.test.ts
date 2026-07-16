// src/tests/unit/ipc/events-subscription.test.ts
import { describe, expect, it } from "vitest";
import { __testEmit, createEventIterator } from "@/ipc/events/handlers";

describe("events subscription", () => {
  it("emits events to subscribers in real-time", async () => {
    const iterator = createEventIterator();

    __testEmit({
      sessionId: "s1",
      text: "hello",
      threadId: "t1",
      type: "acp_session_update",
    });

    const result = await iterator.next();
    expect(result.done).toBe(false);
    expect(result.value).toMatchObject({
      text: "hello",
      threadId: "t1",
      type: "acp_session_update",
    });

    await iterator.return(undefined);
  });

  it("yields multiple events in order", async () => {
    const iterator = createEventIterator();

    __testEmit({
      adapter: "telegram",
      message: {
        authorName: "user",
        channelName: "telegram",
        isMention: true,
        text: "hi",
      },
      threadId: "t1",
      type: "message_received",
    });
    __testEmit({
      adapter: "telegram",
      text: "reply",
      threadId: "t1",
      type: "message_sent",
    });

    const first = await iterator.next();
    const second = await iterator.next();
    expect(first.value).toMatchObject({ type: "message_received" });
    expect(second.value).toMatchObject({ type: "message_sent" });

    await iterator.return(undefined);
  });
});
