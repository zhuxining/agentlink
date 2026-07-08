import { os } from "@orpc/server";
import { disableAdapterInputSchema, enableAdapterInputSchema } from "./schemas";

function getServices() {
  return (globalThis as Record<string, unknown>).__services as {
    chatService: {
      getAdapters: () => unknown[];
      getEnabledAdapters: () => unknown[];
      enableAdapter: (s: string, e: Record<string, string>) => Promise<void>;
      disableAdapter: (s: string) => Promise<void>;
    };
  };
}

export const listAdapters = os.handler(() =>
  getServices().chatService.getAdapters()
);

export const listEnabledAdapters = os.handler(() =>
  getServices().chatService.getEnabledAdapters()
);

export const enableAdapter = os
  .input(enableAdapterInputSchema)
  .handler(async ({ input }) => {
    await getServices().chatService.enableAdapter(input.slug, input.env);
    return { success: true };
  });

export const disableAdapter = os
  .input(disableAdapterInputSchema)
  .handler(async ({ input }) => {
    await getServices().chatService.disableAdapter(input.slug);
    return { success: true };
  });
