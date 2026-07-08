import { Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversations } from "@/hooks/use-conversations";
import { ConversationItem } from "./conversation-item";

export function ConversationList() {
  const { data: conversations, isLoading } = useConversations();

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-2">
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : null}
        {conversations?.map((c) => (
          <ConversationItem conversation={c} key={c.id} />
        ))}
        {conversations?.length === 0 && !isLoading && (
          <p className="py-8 text-center text-muted-foreground text-sm">
            暂无对话
          </p>
        )}
      </div>
    </ScrollArea>
  );
}
