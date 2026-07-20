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

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载中...
      </div>
    );
  }

  // Web 会话即便数据库中尚无记录也直接渲染 WebChat：记录会在首条消息到达后由
  // ChatService 懒落库。用 createLocalWebAdapter / createLocalConversation 约定的
  // `web:` 线程前缀识别，避免依赖尚未写库的 adapter 字段。
  const isWeb = conv?.adapter === "web" || conversationId.startsWith("web:");
  if (isWeb) {
    return (
      <WebChat
        initialMessages={initialMessages}
        key={conversationId}
        threadId={conversationId}
      />
    );
  }

  if (!conv) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载中...
      </div>
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
