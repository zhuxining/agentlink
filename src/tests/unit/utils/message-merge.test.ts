// src/tests/unit/utils/message-merge.test.ts
import { describe, expect, it } from "vitest";
import type { Transcript } from "@/ipc/conversation/schemas";
import { mergeMessages } from "@/utils/message-merge";

const mk = (role: "user" | "agent", content: string): Transcript => ({
  content,
  conversationId: "c1",
  createdAt: 0,
  id: 0,
  role,
});

describe("mergeMessages", () => {
  it("returns history as-is when no streaming message", () => {
    const history = [mk("user", "hi"), mk("agent", "hello")];
    expect(mergeMessages(history, null)).toEqual(history);
  });

  it("appends streaming message after history", () => {
    const history = [mk("user", "hi")];
    const streaming = { isThinking: false, text: "hel" };
    const result = mergeMessages(history, streaming);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ content: "hel", role: "agent" });
  });

  it("appends thinking placeholder when isThinking", () => {
    const history = [mk("user", "hi")];
    const streaming = { isThinking: true, text: "" };
    const result = mergeMessages(history, streaming);
    expect(result).toHaveLength(2);
    expect(result[1].role).toBe("agent");
    expect(result[1].isThinking).toBe(true);
  });

  it("returns empty history with streaming when history empty", () => {
    const result = mergeMessages([], { isThinking: false, text: "partial" });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ content: "partial", role: "agent" });
  });
});
