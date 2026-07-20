import type { UIMessage } from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";

interface Props {
  adapterName: string;
  initialMessages: UIMessage[];
}

export function IMChat({ initialMessages, adapterName }: Props) {
  return (
    <Conversation>
      <ConversationContent>
        {initialMessages.length === 0 ? (
          <div className="flex size-full items-center justify-center text-muted-foreground text-sm">
            此 {adapterName} 会话暂无消息
          </div>
        ) : (
          initialMessages.map((m) => (
            <Message from={m.role} key={m.id}>
              <MessageContent>
                {m.parts.map((p, i) =>
                  p.type === "text" ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: TextUIPart lacks a unique id
                    <MessageResponse key={`${m.id}-${i}`}>
                      {p.text}
                    </MessageResponse>
                  ) : null
                )}
              </MessageContent>
            </Message>
          ))
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
