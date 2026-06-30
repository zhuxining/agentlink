import { type ClientContext, createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/message-port";
import type { RouterClient } from "@orpc/server";
import { IPC_CHANNELS } from "@/constants";
import type { router } from "./router";

type RPCClient = RouterClient<typeof router>;

class IPCManager {
  private readonly clientPort: MessagePort;
  private readonly serverPort: MessagePort;

  private rpcLink: RPCLink<ClientContext> | null = null;

  private _client: RPCClient | null = null;
  private _ready: Promise<void>;
  private _resolveReady!: () => void;

  constructor() {
    const { port1: clientChannelPort, port2: serverChannelPort } =
      new MessageChannel();
    this.clientPort = clientChannelPort;
    this.serverPort = serverChannelPort;

    this._ready = new Promise((resolve) => {
      this._resolveReady = resolve;
    });

    // Initialize asynchronously so MessageChannel transfer doesn't
    // race with the first IPC call made by any component.
    queueMicrotask(() => {
      this.initialize();
    });
  }

  /** The oRPC client. Calls trigger lazy initialization. */
  get client(): RPCClient {
    if (!this._client) {
      this.initialize();
    }
    return this._client!;
  }

  /** Wait for the IPC bridge to be fully set up. */
  ready(): Promise<void> {
    return this._ready;
  }

  private initialize(): void {
    if (this._client) {
      return;
    }

    this.rpcLink = new RPCLink({
      port: this.clientPort,
    });
    this._client = createORPCClient(this.rpcLink);

    this.clientPort.start();

    // Transfer serverPort to main process via preload bridge.
    // This neuters serverPort but clientPort stays usable.
    window.postMessage(IPC_CHANNELS.START_ORPC_SERVER, "*", [this.serverPort]);

    // Signal ready on next microtask so the MessageChannel has
    // settled after the transfer.
    queueMicrotask(() => {
      this._resolveReady();
    });
  }
}

export const ipc = new IPCManager();
