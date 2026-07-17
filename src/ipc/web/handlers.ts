import { os } from "@orpc/server";

export const getEndpoint = os.handler(() => {
  const webServer = (
    globalThis as unknown as { __webServer?: { port: number } }
  ).__webServer;
  if (!webServer) {
    throw new Error("Web HTTP server not ready");
  }
  return `http://127.0.0.1:${webServer.port}/api/chat`;
});
