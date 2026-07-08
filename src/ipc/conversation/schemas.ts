import { z } from "zod";

export const conversationSchema = z.object({
  adapter: z.string(),
  agentId: z.string().nullable(),
  createdAt: z.number(),
  id: z.string(),
  title: z.string(),
  updatedAt: z.number(),
});

export const transcriptSchema = z.object({
  content: z.string(),
  conversationId: z.string(),
  createdAt: z.number(),
  id: z.number(),
  role: z.enum(["user", "agent"]),
});

export type Conversation = z.infer<typeof conversationSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;

export const getConversationInputSchema = z.object({ id: z.string() });
export const getMessagesInputSchema = z.object({ conversationId: z.string() });
