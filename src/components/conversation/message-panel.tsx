import { Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMessages } from "@/hooks/use-conversations";

interface Props {
  conversationId: string;
}

export function MessagePanel({ conversationId }: Props) {
  const { data: messages, isLoading } = useMessages(conversationId);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-4">
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : null}
        {messages?.map((m) => (
          <div
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            key={m.id}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              <p className="whitespace-pre-wrap text-sm">{m.content}</p>
              <span className="mt-1 block text-right text-xs opacity-70">
                {new Date(m.createdAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
        {messages?.length === 0 && !isLoading && (
          <p className="py-8 text-center text-muted-foreground text-sm">
            暂无消息
          </p>
        )}
      </div>
    </ScrollArea>
  );
}
