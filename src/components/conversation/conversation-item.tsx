import { Link } from "@tanstack/react-router";
import type { Conversation } from "@/ipc/conversation/schemas";

interface Props {
  conversation: Conversation;
}

export function ConversationItem({ conversation }: Props) {
  return (
    <Link
      className="block rounded-lg border p-3 transition-colors hover:bg-accent"
      params={{ id: conversation.id }}
      to="/conversation/$id"
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <span className="truncate font-medium text-sm">
            {conversation.title || conversation.id}
          </span>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {conversation.adapter} ·{" "}
            {new Date(conversation.updatedAt).toLocaleString()}
          </p>
        </div>
        {conversation.agentId ? (
          <span className="shrink-0 text-muted-foreground text-xs">
            {conversation.agentId}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
