import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { Chat } from "chat";

export interface WebHttpServer {
  close: () => Promise<void>;
  port: number;
}

async function handleChatRequest(
  chat: Chat,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (req.method !== "POST" || req.url !== "/api/chat") {
    res.writeHead(404).end();
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const body = Buffer.concat(chunks).toString("utf-8");

  const controller = new AbortController();
  const onClose = () => controller.abort();
  res.on("close", onClose);

  const request = new Request(`http://127.0.0.1${req.url ?? ""}`, {
    body,
    headers: req.headers as HeadersInit,
    method: "POST",
    signal: controller.signal,
  });

  try {
    const response = await chat.webhooks.web(request);
    res.on("close", () => {
      try {
        response.body?.cancel().catch(() => {
          // ignore cancel errors (e.g. stream already locked/consumed)
        });
      } catch {
        // ignore sync cancel errors
      }
    });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) {
      const stream = Readable.fromWeb(
        response.body as unknown as WebReadableStream
      );
      stream.on("error", (err) => {
        console.error("[web] stream error:", err);
        if (!res.writableEnded) {
          res.end();
        }
      });
      stream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    console.error(
      "[web] handler error:",
      err instanceof Error ? err.stack : err
    );
    if (!res.headersSent) {
      res.writeHead(500).end();
    }
  } finally {
    res.off("close", onClose);
  }
}

// biome-ignore lint/suspicious/useAwait: async signature is part of the public API contract
export async function createWebHttpServer(
  chat: Chat,
  opts: { port?: number } = {}
): Promise<WebHttpServer> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      handleChatRequest(chat, req, res).catch((err) => {
        console.error(
          "[web] unhandled request error:",
          err instanceof Error ? err.stack : err
        );
      });
    });

    server.on("error", reject);
    server.listen(opts.port ?? 0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      if (port === 0) {
        reject(new Error("Failed to bind web server"));
        return;
      }
      resolve({
        close: () => new Promise<void>((r) => server.close(() => r())),
        port,
      });
    });
  });
}
