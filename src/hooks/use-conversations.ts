import { useQuery } from "@tanstack/react-query";
import { getMessages, listConversations } from "@/actions/conversation";
import { ipc } from "@/ipc/manager";

export function useConversations() {
  return useQuery({
    queryFn: listConversations,
    queryKey: ["conversations"],
  });
}

export function useConversation(id: string) {
  return useQuery({
    enabled: !!id,
    queryFn: () => ipc.client.conversation.getConversation({ id }),
    queryKey: ["conversations", id],
  });
}

export function useMessages(conversationId: string) {
  return useQuery({
    enabled: !!conversationId,
    queryFn: () => getMessages(conversationId),
    queryKey: ["conversations", conversationId, "messages"],
  });
}
