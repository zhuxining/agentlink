import { describe, expect, it } from "vitest";
import type { Transcript } from "@/ipc/conversation/schemas";
import { toUIMessages } from "@/utils/transcript-to-ui-messages";

describe("toUIMessages", () => {
  it("maps user transcript to user UIMessage with done text part", () => {
    const transcripts: Transcript[] = [
      {
        content: "hello",
        conversationId: "c1",
        createdAt: 1000,
        id: 1,
        role: "user",
      },
    ];
    const result = toUIMessages(transcripts);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
    expect(result[0].parts).toEqual([
      { state: "done", text: "hello", type: "text" },
    ]);
    expect(result[0].id).toBe("t-1");
    expect((result[0].metadata as { createdAt: Date }).createdAt).toEqual(
      new Date(1000)
    );
  });

  it("maps agent transcript to assistant UIMessage", () => {
    const transcripts: Transcript[] = [
      {
        content: "hi back",
        conversationId: "c1",
        createdAt: 2000,
        id: 2,
        role: "agent",
      },
    ];
    const result = toUIMessages(transcripts);
    expect(result[0].role).toBe("assistant");
  });

  it("returns empty array for empty input", () => {
    expect(toUIMessages([])).toEqual([]);
  });

  it("uses index fallback when id is undefined", () => {
    const transcripts = [
      {
        content: "x",
        conversationId: "c1",
        createdAt: 1000,
        id: undefined as unknown as number,
        role: "user" as const,
      },
    ];
    const result = toUIMessages(transcripts);
    expect(result[0].id).toBe("t-0");
  });
});
