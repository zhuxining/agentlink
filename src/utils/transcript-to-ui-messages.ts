import type { UIMessage } from "ai";
import type { Transcript } from "@/ipc/conversation/schemas";

export function toUIMessages(transcripts: Transcript[]): UIMessage[] {
  return transcripts.map((t, i) => ({
    id: `t-${t.id ?? i}`,
    metadata: { createdAt: new Date(t.createdAt) },
    parts: [{ state: "done" as const, text: t.content, type: "text" as const }],
    role: t.role === "user" ? "user" : "assistant",
  }));
}
