import { z } from "zod";

export const eventSchema = z.object({
  adapter: z.string().optional(),
  error: z.string().optional(),
  message: z
    .object({
      authorName: z.string(),
      channelName: z.string().nullable(),
      isMention: z.boolean(),
      text: z.string(),
    })
    .optional(),
  serverId: z.string().optional(),
  sessionId: z.string().optional(),
  status: z.string().optional(),
  text: z.string().optional(),
  threadId: z.string().optional(),
  type: z.string(),
});
