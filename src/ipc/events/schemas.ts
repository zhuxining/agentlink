import { z } from "zod";

export const eventSchema = z.object({
  type: z.string(),
  threadId: z.string().optional(),
  adapter: z.string().optional(),
  message: z
    .object({
      text: z.string(),
      authorName: z.string(),
      channelName: z.string().nullable(),
      isMention: z.boolean(),
    })
    .optional(),
  text: z.string().optional(),
  status: z.string().optional(),
  error: z.string().optional(),
  sessionId: z.string().optional(),
  serverId: z.string().optional(),
});
