// src/routes/conversation.$id.tsx
// biome-ignore lint/style/useFilenamingConvention: $id is TanStack Router dynamic route param
import { createFileRoute, useParams } from "@tanstack/react-router";
import { MessagePanel } from "@/components/conversation/message-panel";

function ConversationDetail() {
  const { id } = useParams({ from: "/conversation/$id" });
  return <MessagePanel conversationId={id} />;
}

export const Route = createFileRoute("/conversation/$id")({
  component: ConversationDetail,
});
