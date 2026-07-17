import type { Chat } from "chat";
import { describe, expect, it } from "vitest";
import { createWebHttpServer } from "@/services/web/server";

function makeMockChat(responseBody = "ok"): Chat {
  return {
    webhooks: {
      web: async (_request: Request) =>
        new Response(responseBody, {
          headers: { "content-type": "text/plain" },
        }),
    },
  } as unknown as Chat;
}

describe("createWebHttpServer", () => {
  it("returns 404 for non-POST or wrong path", async () => {
    const { port, close } = await createWebHttpServer(makeMockChat());
    const res = await fetch(`http://127.0.0.1:${port}/unknown`);
    expect(res.status).toBe(404);
    await close();
  });

  it("proxies POST /api/chat to chat.webhooks.web and streams body back", async () => {
    const { port, close } = await createWebHttpServer(
      makeMockChat("hello-stream")
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      body: JSON.stringify({ messages: [] }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello-stream");
    await close();
  });

  it("listens only on 127.0.0.1 with OS-assigned port when port=0", async () => {
    const { port, close } = await createWebHttpServer(makeMockChat());
    expect(port).toBeGreaterThan(0);
    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      body: "{}",
      method: "POST",
    });
    expect(res.status).toBe(200);
    await close();
  });
});
