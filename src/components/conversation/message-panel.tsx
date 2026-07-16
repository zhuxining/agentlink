// src/components/conversation/message-panel.tsx
import { useMessages } from "@/hooks/use-conversations";
import { useStreamingMessage } from "@/hooks/use-streaming-message";
import { mergeMessages } from "@/utils/message-merge";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Loader2 } from "lucide-react";

interface Props {
  conversationId: string;
}

export function MessagePanel({ conversationId }: Props) {
  const { data: messages, isLoading } = useMessages(conversationId);
  const streaming = useStreamingMessage(conversationId);

  const merged = mergeMessages(
    messages ?? [],
    streaming.isStreaming
      ? { isThinking: streaming.isThinking, text: streaming.text }
      : null
  );

  return (
    <Conversation>
      <ConversationContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : null}
        {merged.map((m) => (
          <Message
            from={m.role === "user" ? "user" : "assistant"}
            key={`${m.id}-${m.createdAt}`}
          >
            <MessageContent>
              {m.isThinking ? (
                <div className="text-muted-foreground text-sm">
                  <Shimmer>正在思考...</Shimmer>
                </div>
              ) : (
                <MessageResponse>{m.content}</MessageResponse>
              )}
            </MessageContent>
          </Message>
        ))}
        {streaming.error ? (
          <Message from="assistant">
            <MessageContent>
              <div className="text-destructive text-sm">
                {streaming.error}
              </div>
            </MessageContent>
          </Message>
        ) : null}
        {merged.length === 0 && !isLoading && !streaming.isStreaming ? (
          <div className="flex size-full items-center justify-center text-muted-foreground text-sm">
            暂无消息
          </div>
        ) : null}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
