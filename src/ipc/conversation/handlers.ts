import { os } from "@orpc/server";
import { getDatabase } from "@/services/persistence";
import { getConversationInputSchema, getMessagesInputSchema } from "./schemas";

export const listConversations = os.handler(() => {
  const db = getDatabase();
  return db
    .prepare(
      "SELECT id, adapter, agent_id as agentId, title, created_at as createdAt, updated_at as updatedAt FROM conversations ORDER BY updated_at DESC LIMIT 50"
    )
    .all();
});

export const getConversation = os
  .input(getConversationInputSchema)
  .handler(({ input }) => {
    const db = getDatabase();
    return db
      .prepare(
        "SELECT id, adapter, agent_id as agentId, title, created_at as createdAt, updated_at as updatedAt FROM conversations WHERE id = ?"
      )
      .get(input.id);
  });

export const getMessages = os
  .input(getMessagesInputSchema)
  .handler(({ input }) => {
    const db = getDatabase();
    return db
      .prepare(
        "SELECT id, conversation_id as conversationId, role, content, created_at as createdAt FROM transcripts WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 100"
      )
      .all(input.conversationId);
  });
