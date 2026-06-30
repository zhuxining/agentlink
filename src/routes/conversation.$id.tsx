import { createFileRoute } from "@tanstack/react-router";
import { MessagePanel } from "@/components/conversation/message-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConversation } from "@/hooks/use-conversations";
import type { Conversation } from "@/ipc/conversation/schemas";

function ConversationDetail() {
  const { id } = Route.useParams();
  const { data: conv } = useConversation(id);
  const conversation = conv as Conversation | undefined;

  return (
    <div className="flex h-full flex-col p-4">
      <Card className="flex flex-1 flex-col">
        <CardHeader>
          <CardTitle className="text-sm">{conversation?.title || id}</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1">
          <MessagePanel conversationId={id} />
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/conversation/$id")({
  component: ConversationDetail,
});
