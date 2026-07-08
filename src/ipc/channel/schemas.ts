import { z } from "zod";

export const adapterStatusSchema = z.object({
  description: z.string(),
  enabled: z.boolean(),
  errorMessage: z.string().optional(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(["disconnected", "connecting", "connected", "error"]),
});

export const enableAdapterInputSchema = z.object({
  env: z.record(z.string(), z.string()),
  slug: z.string(),
});
export const disableAdapterInputSchema = z.object({ slug: z.string() });

export type AdapterStatus = z.infer<typeof adapterStatusSchema>;
