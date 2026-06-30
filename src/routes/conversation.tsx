import { createFileRoute } from "@tanstack/react-router";
import { ConversationList } from "@/components/conversation/conversation-list";

export const Route = createFileRoute("/conversation")({
  component: ConversationList,
});
