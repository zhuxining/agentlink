// src/tests/unit/services/acp/acp-service.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AcpService } from "@/services/acp/acp-service";
import type {
  createMemoryDatabase,
  MockConfigState,
} from "@/tests/unit/helpers/persistence-mock";

const mocks = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof createMemoryDatabase>,
  state: { acpServers: [], adapters: {} } as MockConfigState,
}));

vi.mock("@/services/persistence", async () => {
  const { createMemoryDatabase: createDb, makePersistenceMock } = await import(
    "@/tests/unit/helpers/persistence-mock"
  );
  mocks.db = createDb();
  return makePersistenceMock(mocks.db, mocks.state);
});

// 窄 mock：捕获 session/update 通知回调，并暴露 resolvePrompt 供测试控制 prompt 完成
const sdk = vi.hoisted(() => {
  let notifyHandler:
    | ((ctx: {
        params: {
          sessionId: string;
          update: {
            sessionUpdate: string;
            content: { type: string; text: string };
          };
        };
      }) => void)
    | null = null;
  let resolvePrompt: ((v: { stopReason: string }) => void) | null = null;
  const app = {
    connectWith: async (
      _stream: unknown,
      cb: (ctx: {
        buildSession: (cwd: string) => {
          start: () => Promise<{
            sessionId: string;
            prompt: (p: string) => Promise<{ stopReason: string }>;
            dispose: () => void;
          }>;
        };
      }) => Promise<void>
    ) => {
      const ctx = {
        buildSession: () => ({
          start: async () => ({
            dispose: () => {
              // 测试无需清理
            },
            prompt: () =>
              new Promise<{ stopReason: string }>((res) => {
                resolvePrompt = res;
              }),
            sessionId: "sess_1",
          }),
        }),
      };
      await cb(ctx);
    },
    onNotification: (_name: string, cb: typeof notifyHandler) => {
      notifyHandler = cb;
    },
    onRequest: () => {
      // 测试无需处理权限请求
    },
  };
  return {
    app,
    getNotify: () => notifyHandler,
    resolvePrompt: (v: { stopReason: string }) => resolvePrompt?.(v),
  };
});

vi.mock(
  "@agentclientprotocol/sdk",
  () =>
    ({
      client: () => sdk.app,
    }) as unknown as typeof import("@agentclientprotocol/sdk")
);

vi.mock(
  "@/services/acp/acp-transport",
  () =>
    ({
      createStdioStream: () => ({
        process: {
          kill: () => {
            // 测试不实际终止进程
          },
          on: () => {
            // 测试不监听进程退出
          },
        },
        stream: {},
      }),
    }) as unknown as typeof import("@/services/acp/acp-transport")
);

const SERVER = { args: ["pi-acp"], command: "npx", id: "pi", name: "Pi" };

beforeEach(() => {
  mocks.state.acpServers = [];
  mocks.db.exec("DELETE FROM conversations");
});

describe("AcpService config", () => {
  it("addServer then getServers returns it", () => {
    const s = new AcpService();
    s.addServer(SERVER);
    expect(s.getServers().map((x) => x.id)).toContain("pi");
  });

  it("addServer throws on duplicate id", () => {
    const s = new AcpService();
    s.addServer(SERVER);
    expect(() => s.addServer(SERVER)).toThrow("exists");
  });

  it("removeServer removes the entry", () => {
    const s = new AcpService();
    s.addServer(SERVER);
    s.removeServer("pi");
    expect(s.getServers().map((x) => x.id)).not.toContain("pi");
  });

  it("getServerStatus defaults to disconnected", () => {
    expect(new AcpService().getServerStatus("pi")).toBe("disconnected");
  });
});

describe("AcpService connect/sendPrompt", () => {
  it("connect throws when server not found", async () => {
    await expect(new AcpService().connect("nope")).rejects.toThrow("not found");
  });

  it("connect succeeds and flips status to connected", async () => {
    const s = new AcpService();
    s.addServer(SERVER);
    await s.connect("pi");
    expect(s.getServerStatus("pi")).toBe("connected");
    s.disconnect("pi");
    expect(s.getServerStatus("pi")).toBe("disconnected");
  });

  it("sendPrompt throws when server not connected", async () => {
    await expect(
      new AcpService().sendPrompt({
        prompt: "hi",
        serverId: "pi",
        threadId: "t1",
      })
    ).rejects.toThrow("not connected");
  });

  it("sendPrompt returns sessionId/stopReason and streams chunks to handler", async () => {
    mocks.db
      .prepare(
        "INSERT INTO conversations (id, adapter, title, created_at, updated_at) VALUES (?,?,?,?,?)"
      )
      .run("t1", "telegram", "", Date.now(), Date.now());
    const s = new AcpService();
    s.addServer(SERVER);
    const onChunk = vi.fn();
    s.setChunkHandler(onChunk);
    await s.connect("pi");

    const p = s.sendPrompt({ prompt: "hi", serverId: "pi", threadId: "t1" });
    // sendPrompt 在首个 await 之后才会建立 sessionId→threadId 的路由映射，
    // 因此先让出一次微任务，确保映射就绪再下发 session/update 通知。
    await Promise.resolve();
    sdk.getNotify()?.({
      params: {
        sessionId: "sess_1",
        update: {
          content: { text: "chunk!", type: "text" },
          sessionUpdate: "agent_message_chunk",
        },
      },
    });
    sdk.resolvePrompt({ stopReason: "end_turn" });
    const res = await p;

    expect(res).toMatchObject({ sessionId: "sess_1", stopReason: "end_turn" });
    expect(onChunk).toHaveBeenCalledWith("t1", "chunk!");
    s.disconnect("pi");
  });

  it("sendPrompt returns a textStream that yields chunks then completes", async () => {
    mocks.db
      .prepare(
        "INSERT INTO conversations (id, adapter, title, created_at, updated_at) VALUES (?,?,?,?,?)"
      )
      .run("t2", "telegram", "", Date.now(), Date.now());
    const s = new AcpService();
    s.addServer(SERVER);
    await s.connect("pi");

    const p = s.sendPrompt({
      prompt: "hi",
      serverId: "pi",
      threadId: "t2",
    });
    await Promise.resolve();
    sdk.getNotify()?.({
      params: {
        sessionId: "sess_1",
        update: {
          content: { text: "Hello", type: "text" },
          sessionUpdate: "agent_message_chunk",
        },
      },
    });
    sdk.getNotify()?.({
      params: {
        sessionId: "sess_1",
        update: {
          content: { text: " World", type: "text" },
          sessionUpdate: "agent_message_chunk",
        },
      },
    });
    sdk.resolvePrompt({ stopReason: "end_turn" });
    const res = await p;

    const collected: string[] = [];
    for await (const chunk of res.textStream) {
      collected.push(chunk);
    }
    expect(collected).toEqual(["Hello", " World"]);
    expect(res.stopReason).toBe("end_turn");
    s.disconnect("pi");
  });
});
