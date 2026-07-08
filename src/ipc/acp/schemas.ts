import { z } from "zod";

export const acpServerSchema = z.object({
  args: z.array(z.string()),
  command: z.string(),
  env: z.record(z.string(), z.string()).optional(),
  id: z.string(),
  name: z.string(),
});

export const addAcpServerInputSchema = acpServerSchema;
export const removeAcpServerInputSchema = z.object({ id: z.string() });
export const connectAcpServerInputSchema = z.object({ id: z.string() });
export const disconnectAcpServerInputSchema = z.object({ id: z.string() });

export type AcpServerStatus = z.infer<typeof acpServerSchema> & {
  status: "disconnected" | "connecting" | "connected" | "error";
  error?: string;
};
