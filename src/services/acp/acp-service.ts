import type { ChildProcess } from "node:child_process";
import type {
  ClientContext,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import { client } from "@agentclientprotocol/sdk";
import type { AppEvent } from "@/services/chat/event-bridge";
import { type AcpServerEntry, configStore } from "@/services/persistence";
import { AsyncQueue } from "@/utils/async-queue";
import { AcpSessionMapper } from "./acp-session-mapper";
import { createStdioStream } from "./acp-transport";

export type { AcpServerEntry as AcpServerConfig } from "@/services/persistence";

interface ActiveConnection {
  process: ChildProcess;
  shutdown: () => void;
}

// Track detailed connection state for getServerStatus.
// During async connect(), status goes connecting → connected.
// On error/disconnect, status goes to disconnected or error.
const connectionStatus = new Map<
  string,
  "disconnected" | "connecting" | "connected" | "error"
>();

// Maps ACP sessionId back to Chat SDK threadId so the
// session/update notification handler can route text chunks.
const sessionToThread = new Map<string, string>();

export class AcpService {
  private readonly connections = new Map<string, ActiveConnection>();
  private readonly contexts = new Map<string, ClientContext>();
  private readonly sessionMapper = new AcpSessionMapper();
  private onChunk: ((threadId: string, text: string) => void) | null = null;
  private onEvent: ((event: AppEvent) => void) | null = null;

  /**
   * Register a handler to receive streaming text chunks.
   * The handler is called for every agent_message_chunk received
   * from any connected ACP server.
   */
  setChunkHandler(handler: (threadId: string, text: string) => void): void {
    this.onChunk = handler;
  }

  /**
   * Register a handler for status change events so the UI can react.
   */
  setEventHandler(handler: (event: AppEvent) => void): void {
    this.onEvent = handler;
  }

  /** Return all configured ACP server entries from the config store. */
  getServers(): AcpServerEntry[] {
    return configStore.get("acpServers", []);
  }

  /** Add a new ACP server entry. Throws if the id already exists. */
  addServer(config: AcpServerEntry): void {
    const servers = this.getServers();
    if (servers.find((s) => s.id === config.id)) {
      throw new Error(`Server "${config.id}" exists`);
    }
    servers.push(config);
    configStore.set("acpServers", servers);
  }

  /** Remove an ACP server entry and disconnect if connected. */
  removeServer(id: string): void {
    configStore.set(
      "acpServers",
      this.getServers().filter((s) => s.id !== id)
    );
    this.disconnect(id);
  }

  /** Get the connection status for an ACP server. */
  getServerStatus(
    id: string
  ): "disconnected" | "connecting" | "connected" | "error" {
    return connectionStatus.get(id) ?? "disconnected";
  }

  /**
   * Connect to an ACP server by id.
   *
   * Spawns the server process, wraps stdio as an ACP Stream via
   * ndJsonStream, and runs connectWith in long-running mode
   * (the callback blocks on shutdownPromise until disconnect() is
   * called).
   */
  async connect(id: string): Promise<void> {
    const server = this.getServers().find((s) => s.id === id);
    if (!server) {
      throw new Error(`Server "${id}" not found`);
    }
    if (this.connections.has(id)) {
      return;
    }

    const { stream, process } = await createStdioStream(
      server.command,
      server.args,
      server.env
    );

    const app = client({ name: "AgentLink" });

    // shutdownPromise blocks the connectWith callback so the
    // connection stays alive. Calling shutdownResolve() unblocks
    // and lets the callback return (closing the connection).
    let shutdownResolve!: () => void;
    const shutdownPromise = new Promise<void>((r) => {
      shutdownResolve = r;
    });

    // readyPromise / readyReject — resolves once connectWith's
    // callback fires (handshake OK), rejects if connectWith itself
    // fails (handshake error). This lets connect() await the
    // handshake without blocking on shutdownPromise.
    let onReady!: () => void;
    let onReadyReject!: (err: unknown) => void;
    const readyPromise = new Promise<void>((resolve, reject) => {
      onReady = resolve;
      onReadyReject = reject;
    });

    // Notify UI: connecting
    connectionStatus.set(id, "connecting");
    this.emitStatusEvent(id, "connecting");

    // Register session/update notification handler — extracts
    // agent_message_chunk text and forwards it via onChunk.
    app.onNotification("session/update", (ctx) => {
      const { sessionId, update } = ctx.params;
      const threadId = sessionToThread.get(sessionId);
      if (!(threadId && this.onChunk)) {
        return;
      }
      if (
        update.sessionUpdate === "agent_message_chunk" &&
        update.content.type === "text"
      ) {
        this.onChunk(threadId, update.content.text);
      }
    });

    // Phase 1: auto-approve all permission requests by selecting
    // the "allow_once" option when available, falling back to the
    // first option.
    app.onRequest("session/request_permission", (ctx) => {
      const allowOnce = ctx.params.options.find((o) => o.kind === "allow_once");
      return {
        outcome: {
          optionId:
            allowOnce?.optionId ??
            ctx.params.options[0]?.optionId ??
            "allow_once",
          outcome: "selected" as const,
        },
      } satisfies RequestPermissionResponse;
    });

    // connectWith keeps the connection open while the callback
    // runs. The callback blocks on shutdownPromise so the
    // connection stays alive until disconnect() is called.
    // We intentionally do NOT await connectWith — it only resolves
    // after disconnect() resolves shutdownPromise.
    app
      .connectWith(stream, async (ctx: ClientContext) => {
        this.contexts.set(id, ctx);
        this.connections.set(id, {
          process,
          shutdown: shutdownResolve,
        });
        onReady();
        await shutdownPromise;
      })
      .catch((err) => {
        console.error(`[AcpService] Connection to "${id}" failed:`, err);
        this.contexts.delete(id);
        this.connections.delete(id);
        connectionStatus.set(id, "error");
        this.emitStatusEvent(
          id,
          "error",
          err instanceof Error ? err.message : String(err)
        );
        process.kill();
        onReadyReject(err);
      });

    process.on("exit", (code) => {
      console.log(`[AcpService] Server "${id}" exited (${code})`);
      this.contexts.delete(id);
      this.connections.delete(id);
      connectionStatus.set(id, "disconnected");
      this.emitStatusEvent(id, "disconnected");
    });

    // Wait for the ACP handshake to complete or fail.
    // readyPromise resolves once connectWith's callback fires;
    // it rejects if connectWith itself fails (handshake error).
    await readyPromise;

    connectionStatus.set(id, "connected");
    this.emitStatusEvent(id, "connected");
    console.log(`[AcpService] Connected to "${id}"`);
  }

  /** Disconnect from an ACP server, shutting down its process. */
  disconnect(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      conn.shutdown();
      conn.process.kill();
    }
    this.connections.delete(id);
    this.contexts.delete(id);
    connectionStatus.set(id, "disconnected");
    this.emitStatusEvent(id, "disconnected");
  }

  // ── Event emission ─────────────────────────────────────────────
  private emitStatusEvent(
    serverId: string,
    status: "connecting" | "connected" | "disconnected" | "error",
    error?: string
  ): void {
    this.onEvent?.({
      error,
      serverId,
      status,
      type: "acp_server_status_changed",
    });
  }

  /**
   * Send a user prompt to a connected ACP server.
   *
   * Creates a new ACP session (or reuses an existing one via the
   * session mapper), sends the prompt, and returns the session id
   * and stop reason. Streaming text chunks are delivered
   * asynchronously through the onChunk handler.
   */
  async sendPrompt(params: {
    serverId: string;
    threadId: string;
    prompt: string;
  }): Promise<{
    sessionId: string;
    stopReason: string;
    textStream: AsyncIterable<string>;
  }> {
    const ctx = this.contexts.get(params.serverId);
    if (!ctx) {
      throw new Error(`Server "${params.serverId}" not connected`);
    }

    const cwd = process.cwd();
    const session = await ctx.buildSession(cwd).start();
    const { sessionId } = session;

    // Persist the session mapping so future turns can reuse it.
    // Phase 1 always creates a new session per turn; reuse logic
    // will be added in a later phase.
    this.sessionMapper.createMapping({
      acpServerId: params.serverId,
      acpSessionId: sessionId,
      agentId: "default",
      threadId: params.threadId,
    });

    // Wire sessionId -> threadId for the onNotification handler.
    sessionToThread.set(sessionId, params.threadId);

    // Per-call queue: captures agent_message_chunk text for this turn.
    // The global onChunk handler (set via setChunkHandler) still fires
    // for downstream consumers (event bridge -> UI subscription).
    const queue = new AsyncQueue<string>();
    const previousChunk = this.onChunk;
    this.onChunk = (threadId: string, text: string) => {
      previousChunk?.(threadId, text);
      if (threadId === params.threadId) {
        queue.push(text);
      }
    };

    try {
      const response = await session.prompt(params.prompt);
      queue.close();
      return {
        sessionId,
        stopReason: response.stopReason,
        textStream: queue.iter(),
      };
    } catch (err) {
      queue.close();
      throw err;
    } finally {
      this.onChunk = previousChunk;
      sessionToThread.delete(sessionId);
      session.dispose();
    }
  }

  /** Disconnect from all active ACP server connections. */
  disconnectAll(): void {
    for (const [id] of this.connections) {
      this.disconnect(id);
    }
  }
}
