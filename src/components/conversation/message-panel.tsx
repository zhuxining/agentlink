import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { useConversation, useMessages } from "@/hooks/use-conversations";
import { toUIMessages } from "@/utils/transcript-to-ui-messages";
import { IMChat } from "./im-chat";
import { WebChat } from "./web-chat";

interface Props {
  conversationId: string;
}

export function MessagePanel({ conversationId }: Props) {
  const { data: conv } = useConversation(conversationId);
  const { data: transcripts, isLoading } = useMessages(conversationId);

  const initialMessages = useMemo(
    () => toUIMessages(transcripts ?? []),
    [transcripts]
  );

  if (isLoading || !conv) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载中...
      </div>
    );
  }

  if (conv.adapter === "web") {
    return (
      <WebChat
        initialMessages={initialMessages}
        key={conversationId}
        threadId={conversationId}
      />
    );
  }

  return (
    <IMChat
      adapterName={conv.adapter}
      initialMessages={initialMessages}
      key={conversationId}
    />
  );
}
