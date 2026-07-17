import type { WebAdapter } from "@chat-adapter/web";
import { createWebAdapter } from "@chat-adapter/web";

export function createLocalWebAdapter(): WebAdapter {
  return createWebAdapter({
    getUser: () => ({ id: "local", name: "AgentLink User" }),
    threadIdFor: ({ user, conversationId }) =>
      `web:${user.id}:${conversationId}`,
    userName: "AgentLink",
  });
}
