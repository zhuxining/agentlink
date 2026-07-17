import { useChat } from "@chat-adapter/web/react";
import type { UIMessage } from "ai";
import { useCallback, useState } from "react";
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
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useWebEndpoint } from "@/hooks/use-web-endpoint";

interface Props {
  initialMessages: UIMessage[];
  threadId: string;
}

export function WebChat({ threadId, initialMessages }: Props) {
  const { data: endpoint } = useWebEndpoint();
  const { messages, sendMessage, status, error, stop } = useChat({
    api: endpoint ?? "/api/chat",
    messages: initialMessages,
    threadId,
  });

  const isBusy = status === "submitted" || status === "streaming";
  const [input, setInput] = useState("");

  const last = messages.at(-1);
  const showShimmer = isBusy && last?.role !== "assistant";

  const handleSubmit = useCallback(
    (message: { files: unknown[]; text: string }) => {
      if (message.text.trim() && !isBusy) {
        sendMessage({ text: message.text }).catch(() => undefined);
        setInput("");
      }
    },
    [isBusy, sendMessage]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    []
  );

  return (
    <Conversation>
      <ConversationContent>
        {messages.map((m: UIMessage) => (
          <Message from={m.role} key={m.id}>
            <MessageContent>
              {m.parts.map((p: UIMessage["parts"][number], i: number) =>
                p.type === "text" ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: TextUIPart lacks a unique id
                  <MessageResponse key={`${m.id}-${i}`}>
                    {p.text}
                  </MessageResponse>
                ) : null
              )}
            </MessageContent>
          </Message>
        ))}
        {showShimmer ? (
          <Message from="assistant">
            <MessageContent>
              <Shimmer>正在思考...</Shimmer>
            </MessageContent>
          </Message>
        ) : null}
        {error ? (
          <Message from="assistant">
            <MessageContent>
              <div className="text-destructive text-sm">{error.message}</div>
            </MessageContent>
          </Message>
        ) : null}
      </ConversationContent>
      <ConversationScrollButton />
      <PromptInput onSubmit={handleSubmit}>
        <PromptInputTextarea
          disabled={isBusy || !endpoint}
          onChange={handleChange}
          value={input}
        />
        <PromptInputSubmit
          disabled={isBusy || !endpoint || !input.trim()}
          onClick={isBusy ? () => stop() : undefined}
        >
          {isBusy ? "停止" : "发送"}
        </PromptInputSubmit>
      </PromptInput>
    </Conversation>
  );
}
