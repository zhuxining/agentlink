import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/persistence", async () => {
  const { createMemoryDatabase, makePersistenceMock } = await import(
    "@/tests/unit/helpers/persistence-mock"
  );
  const db = createMemoryDatabase();
  const mock = makePersistenceMock(db, { acpServers: [], adapters: {} });
  return {
    ...mock,
    createStateAdapter: () => ({
      connect: async () => undefined,
      disconnect: async () => undefined,
      get: async () => null,
      set: async () => undefined,
    }),
  };
});

describe("bootstrapServices", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__webServer = undefined;
  });

  it("starts web HTTP server and exposes __webServer with port > 0", async () => {
    const { bootstrapServices } = await import("@/services/bootstrap");
    const services = await bootstrapServices();
    const webServer = (
      globalThis as unknown as { __webServer?: { port: number } }
    ).__webServer;
    expect(webServer).toBeDefined();
    expect(webServer?.port).toBeGreaterThan(0);
    await services.acpService.disconnect(
      services.acpService.getServers()[0]?.id ?? ""
    );
  });
});
