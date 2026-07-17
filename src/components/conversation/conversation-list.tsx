import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, PlusIcon } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversations } from "@/hooks/use-conversations";
import { ConversationItem } from "./conversation-item";

export function ConversationList() {
  const { data: conversations, isLoading } = useConversations();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createLocalConversation = useCallback(async () => {
    const threadId = `web:local:${nanoid()}`;
    await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    navigate({ params: { id: threadId }, to: "/conversation/$id" });
  }, [navigate, queryClient]);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-2">
        <Button
          className="w-full"
          onClick={createLocalConversation}
          variant="outline"
        >
          <PlusIcon className="h-4 w-4" />
          新建会话
        </Button>
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
