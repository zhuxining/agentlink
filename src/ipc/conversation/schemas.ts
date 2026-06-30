import { z } from "zod";

export const conversationSchema = z.object({
  id: z.string(),
  adapter: z.string(),
  agentId: z.string().nullable(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const transcriptSchema = z.object({
  id: z.number(),
  conversationId: z.string(),
  role: z.enum(["user", "agent"]),
  content: z.string(),
  createdAt: z.number(),
});

export type Conversation = z.infer<typeof conversationSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;

export const getConversationInputSchema = z.object({ id: z.string() });
export const getMessagesInputSchema = z.object({ conversationId: z.string() });
