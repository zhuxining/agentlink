import { os } from "@orpc/server";
import type { AcpServerStatus } from "./schemas";
import {
  addAcpServerInputSchema,
  connectAcpServerInputSchema,
  disconnectAcpServerInputSchema,
  removeAcpServerInputSchema,
} from "./schemas";

function getServices() {
  return (globalThis as Record<string, unknown>).__services as {
    acpService: {
      getServers(): {
        id: string;
        name: string;
        command: string;
        args: string[];
        env?: Record<string, string>;
      }[];
      addServer(c: unknown): void;
      removeServer(id: string): void;
      connect(id: string): Promise<void>;
      disconnect(id: string): void;
      getServerStatus(id: string): string;
    };
  };
}

export const listAcpServers = os.handler(() => {
  const acp = getServices().acpService;
  return acp.getServers().map((s) => ({
    ...s,
    status: acp.getServerStatus(s.id),
  })) as AcpServerStatus[];
});

export const addAcpServer = os
  .input(addAcpServerInputSchema)
  .handler(({ input }) => {
    getServices().acpService.addServer(input);
    return { success: true };
  });

export const removeAcpServer = os
  .input(removeAcpServerInputSchema)
  .handler(({ input }) => {
    getServices().acpService.removeServer(input.id);
    return { success: true };
  });

export const connectAcpServer = os
  .input(connectAcpServerInputSchema)
  .handler(async ({ input }) => {
    await getServices().acpService.connect(input.id);
    return { success: true };
  });

export const disconnectAcpServer = os
  .input(disconnectAcpServerInputSchema)
  .handler(({ input }) => {
    getServices().acpService.disconnect(input.id);
    return { success: true };
  });
