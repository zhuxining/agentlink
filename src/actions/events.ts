import type { AppEvent } from "@/ipc/events/event-types";
import { ipc } from "@/ipc/manager";

export function getRecentEvents(): Promise<AppEvent[]> {
  return ipc.client.events.getRecentEvents();
}
