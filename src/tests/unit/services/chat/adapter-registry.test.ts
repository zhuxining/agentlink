// src/tests/unit/services/chat/adapter-registry.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdapterRegistry } from "@/services/chat/adapter-registry";
import type { MockConfigState } from "@/tests/unit/helpers/persistence-mock";

const { state } = vi.hoisted(() => ({
  state: { adapters: {}, acpServers: [] } as MockConfigState,
}));

vi.mock("@/services/persistence", async () => {
  const { createMemoryDatabase, makePersistenceMock } = await import(
    "@/tests/unit/helpers/persistence-mock"
  );
  const db = createMemoryDatabase();
  return makePersistenceMock(db, state);
});

vi.mock("chat/adapters", () => ({
  getAdapter: (slug: string) =>
    ({
      telegram: {
        name: "Telegram",
        description: "Telegram adapter",
        packageName: "@chat-adapter/telegram",
        factoryExport: "createAdapter",
      },
      lark: {
        name: "Lark",
        description: "Lark adapter",
        packageName: "@larksuite/vercel-chat-adapter",
        factoryExport: "createAdapter",
      },
    })[slug] ?? null,
}));

const registry = () => new AdapterRegistry();

beforeEach(() => {
  state.adapters = {};
});

describe("AdapterRegistry", () => {
  it("list returns supported adapters disabled by default", () => {
    const entries = registry().list();
    expect(entries.map((e) => e.slug).sort()).toEqual(["lark", "telegram"]);
    expect(entries.every((e) => e.enabled === false)).toBe(true);
    expect(entries.every((e) => e.status === "disconnected")).toBe(true);
  });

  it("get returns a single entry by slug", () => {
    expect(registry().get("telegram")?.name).toBe("Telegram");
    expect(registry().get("missing")).toBeUndefined();
  });

  it("enable marks enabled, stores env, sets connecting status", () => {
    const r = registry();
    r.enable("telegram", { BOT_TOKEN: "x" });
    const entry = r.get("telegram");
    expect(entry?.enabled).toBe(true);
    expect(entry?.env).toEqual({ BOT_TOKEN: "x" });
    expect(entry?.status).toBe("connecting");
    expect(state.adapters.telegram).toEqual({
      env: { BOT_TOKEN: "x" },
      enabled: true,
    });
  });

  it("disable clears enabled flag and sets disconnected", () => {
    const r = registry();
    r.enable("telegram", {});
    r.disable("telegram");
    expect(r.get("telegram")?.enabled).toBe(false);
    expect(r.get("telegram")?.status).toBe("disconnected");
  });

  it("getEnabled filters to enabled adapters only", () => {
    const r = registry();
    r.enable("telegram", {});
    expect(r.getEnabled().map((e) => e.slug)).toEqual(["telegram"]);
  });

  it("setStatus updates tracked status and errorMessage", () => {
    const r = registry();
    r.setStatus("telegram", "error", "boom");
    expect(r.get("telegram")?.status).toBe("error");
    expect(r.get("telegram")?.errorMessage).toBe("boom");
  });

  it("buildAdapterMap returns empty when no adapter enabled", async () => {
    const map = await registry().buildAdapterMap();
    expect(map).toEqual({});
  });
});
