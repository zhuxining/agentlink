import type { Conversation, Transcript } from "@/ipc/conversation/schemas";
import { ipc } from "@/ipc/manager";

export function listConversations(): Promise<Conversation[]> {
  return ipc.client.conversation.listConversations();
}
export function getConversation(id: string): Promise<Conversation | null> {
  return ipc.client.conversation.getConversation({ id });
}
export function getMessages(conversationId: string): Promise<Transcript[]> {
  return ipc.client.conversation.getMessages({ conversationId });
}
