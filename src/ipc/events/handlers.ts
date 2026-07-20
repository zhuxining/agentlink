import { os } from "@orpc/server";
import { EventPublisher } from "@orpc/shared";
import type { AppEvent } from "./event-types";

const recentEvents: AppEvent[] = [];
const MAX_EVENTS = 100;

const eventPublisher = new EventPublisher<{ event: AppEvent }>();

interface EventBridgeLike {
  onEvent: (handler: (event: unknown) => void) => () => void;
}

export function registerEventCollector(): void {
  try {
    const services = (globalThis as Record<string, unknown>).__services as
      | { eventBridge: EventBridgeLike }
      | undefined;
    if (services?.eventBridge) {
      services.eventBridge.onEvent((event: unknown) => {
        recentEvents.push(event as AppEvent);
        if (recentEvents.length > MAX_EVENTS) {
          recentEvents.shift();
        }
        eventPublisher.publish("event", event as AppEvent);
      });
    }
  } catch {
    console.log(
      "[events] Event collector registration skipped (services not ready)"
    );
  }
}

export const getRecentEvents = os.handler(() =>
  recentEvents.splice(0, recentEvents.length)
);
