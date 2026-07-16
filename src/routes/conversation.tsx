// src/routes/conversation.tsx
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { ConversationList } from "@/components/conversation/conversation-list";

function ConversationLayout() {
  const { id } = useParams({ strict: false });

  return (
    <div className="flex h-full">
      <aside className="w-72 shrink-0 border-r">
        <ConversationList />
      </aside>
      <main className="min-w-0 flex-1">
        {id ? (
          <Outlet />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            选择一个对话查看消息
          </div>
        )}
      </main>
    </div>
  );
}

export const Route = createFileRoute("/conversation")({
  component: ConversationLayout,
});
