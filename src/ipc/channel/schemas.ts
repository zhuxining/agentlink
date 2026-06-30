import { z } from "zod";

export const adapterStatusSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  status: z.enum(["disconnected", "connecting", "connected", "error"]),
  errorMessage: z.string().optional(),
});

export const enableAdapterInputSchema = z.object({
  slug: z.string(),
  env: z.record(z.string(), z.string()),
});
export const disableAdapterInputSchema = z.object({ slug: z.string() });

export type AdapterStatus = z.infer<typeof adapterStatusSchema>;
