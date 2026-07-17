import { call } from "@orpc/server";
import { afterEach, describe, expect, it } from "vitest";
import { getEndpoint } from "@/ipc/web/handlers";

afterEach(() => {
  (globalThis as Record<string, unknown>).__webServer = undefined;
});

const NOT_READY_RE = /Web HTTP server not ready/;

describe("web.getEndpoint", () => {
  it("returns http://127.0.0.1:{port}/api/chat when web server is ready", async () => {
    (globalThis as Record<string, unknown>).__webServer = { port: 53_721 };
    const endpoint = await call(getEndpoint, {});
    expect(endpoint).toBe("http://127.0.0.1:53721/api/chat");
  });

  it("throws when web server not initialized", async () => {
    await expect(call(getEndpoint, {})).rejects.toThrow(NOT_READY_RE);
  });
});
