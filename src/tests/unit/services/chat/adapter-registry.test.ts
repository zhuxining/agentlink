// src/tests/unit/services/chat/adapter-registry.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdapterRegistry } from "@/services/chat/adapter-registry";
import type { MockConfigState } from "@/tests/unit/helpers/persistence-mock";

const { state } = vi.hoisted(() => ({
  state: { acpServers: [], adapters: {} } as MockConfigState,
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
      lark: {
        description: "Lark adapter",
        factoryExport: "createAdapter",
        name: "Lark",
        packageName: "@larksuite/vercel-chat-adapter",
      },
      telegram: {
        description: "Telegram adapter",
        factoryExport: "createAdapter",
        name: "Telegram",
        packageName: "@chat-adapter/telegram",
      },
    })[slug] ?? null,
}));

const registry = () => new AdapterRegistry();

beforeEach(() => {
  state.adapters = {};
});

describe("AdapterRegistry", () => {
  it("list returns supported adapters with web always enabled", () => {
    const entries = registry().list();
    const slugs = entries.map((e) => e.slug).sort((a, b) => a.localeCompare(b));
    expect(slugs).toEqual(["lark", "telegram", "web"]);
    const imEntries = slugs.filter((s) => s !== "web");
    expect(
      imEntries.every(
        (s) => entries.find((e) => e.slug === s)?.enabled === false
      )
    ).toBe(true);
    expect(
      imEntries.every(
        (s) => entries.find((e) => e.slug === s)?.status === "disconnected"
      )
    ).toBe(true);
    expect(entries.find((e) => e.slug === "web")?.enabled).toBe(true);
    expect(entries.find((e) => e.slug === "web")?.status).toBe("connected");
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
      enabled: true,
      env: { BOT_TOKEN: "x" },
    });
  });

  it("disable clears enabled flag and sets disconnected", () => {
    const r = registry();
    r.enable("telegram", {});
    r.disable("telegram");
    expect(r.get("telegram")?.enabled).toBe(false);
    expect(r.get("telegram")?.status).toBe("disconnected");
  });

  it("getEnabled returns enabled adapters including web", () => {
    const r = registry();
    r.enable("telegram", {});
    const slugs = r.getEnabled().map((e) => e.slug);
    expect(slugs).toContain("telegram");
    expect(slugs).toContain("web");
  });

  it("setStatus updates tracked status and errorMessage", () => {
    const r = registry();
    r.setStatus("telegram", "error", "boom");
    expect(r.get("telegram")?.status).toBe("error");
    expect(r.get("telegram")?.errorMessage).toBe("boom");
  });

  it("buildAdapterMap returns only web when no adapter enabled", async () => {
    const map = await registry().buildAdapterMap();
    expect(Object.keys(map)).toEqual(["web"]);
    expect(map.web?.name).toBe("web");
  });
});

describe("AdapterRegistry web support", () => {
  it("SUPPORTED includes 'web'", () => {
    const reg = new AdapterRegistry();
    const list = reg.list();
    expect(list.some((a) => a.slug === "web")).toBe(true);
  });

  it("buildAdapterMap always includes 'web' without enabling", async () => {
    const reg = new AdapterRegistry();
    const map = await reg.buildAdapterMap();
    expect(map.web).toBeDefined();
    expect(map.web?.name).toBe("web");
  });

  it("web adapter does not require env vars and is always enabled", () => {
    const reg = new AdapterRegistry();
    const entry = reg.get("web");
    expect(entry?.enabled).toBe(true);
    expect(entry?.status).toBe("connected");
  });
});
