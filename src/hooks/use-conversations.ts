import { useQuery } from "@tanstack/react-query";
import {
  getConversation,
  getMessages,
  listConversations,
} from "@/actions/conversation";

export function useConversations() {
  return useQuery({
    queryFn: listConversations,
    queryKey: ["conversations"],
  });
}

export function useConversation(id: string) {
  return useQuery({
    enabled: !!id,
    queryFn: () => getConversation(id),
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
