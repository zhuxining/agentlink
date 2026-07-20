import { describe, expect, it } from "vitest";
import { createLocalWebAdapter } from "@/services/web/adapter";

describe("createLocalWebAdapter", () => {
  it("has adapter name 'web'", () => {
    const adapter = createLocalWebAdapter();
    expect(adapter.name).toBe("web");
  });

  it("encodes thread id as web:local:{conversationId}", () => {
    const adapter = createLocalWebAdapter();
    const threadId = adapter.encodeThreadId({
      conversationId: "abc123",
      userId: "local",
    });
    expect(threadId).toBe("web:local:abc123");
  });

  it("decodes thread id back to components", () => {
    const adapter = createLocalWebAdapter();
    const data = adapter.decodeThreadId("web:local:abc123");
    expect(data).toEqual({ conversationId: "abc123", userId: "local" });
  });
});
