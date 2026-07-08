import { os } from "@orpc/server";
import type { AppEvent } from "./event-types";

const recentEvents: AppEvent[] = [];
const MAX_EVENTS = 100;

interface EventBridgeLike {
  onEvent: (handler: (event: unknown) => void) => () => void;
}

/**
 * Register event collector in bootstrap phase.
 * Must be called after services are initialized.
 * Uses try/catch and optional chaining because services might not be ready.
 */
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
      });
    }
  } catch {
    console.log(
      "[events] Event collector registration skipped (services not ready)"
    );
  }
}

/**
 * Returns all recent events and clears the buffer.
 * Used by renderer via polling pattern.
 */
export const getRecentEvents = os.handler(() =>
  recentEvents.splice(0, recentEvents.length)
);
