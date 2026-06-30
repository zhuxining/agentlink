import { useQuery } from "@tanstack/react-query";
import { getMessages, listConversations } from "@/actions/conversation";
import { ipc } from "@/ipc/manager";

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: ["conversations", id],
    queryFn: () => ipc.client.conversation.getConversation({ id }),
    enabled: !!id,
  });
}

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: ["conversations", conversationId, "messages"],
    queryFn: () => getMessages(conversationId),
    enabled: !!conversationId,
  });
}
