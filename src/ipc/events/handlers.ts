import { os } from "@orpc/server";
import { EventPublisher } from "@orpc/shared";
import type { AppEvent } from "./event-types";

const recentEvents: AppEvent[] = [];
const MAX_EVENTS = 100;

/**
 * EventPublisher for real-time streaming of events to the renderer.
 * registerEventCollector pushes every EventBridge event here,
 * and the `subscribe` endpoint yields them to subscribers.
 */
const eventPublisher = new EventPublisher<{ event: AppEvent }>();

/**
 * Returns an async iterator over all events. Used by the `subscribe`
 * endpoint and available for direct testing.
 */
export function createEventIterator(): AsyncGenerator<AppEvent> {
  return eventPublisher.subscribe("event");
}

/** Test helper: directly emit an event (unit tests only). */
export const __testEmit = (event: AppEvent): void =>
  eventPublisher.publish("event", event);

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
        eventPublisher.publish("event", event as AppEvent);
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

/**
 * Real-time event subscription. Yields events to the renderer as they
 * arrive via the EventBridge. Replaces polling for high-frequency
 * events (e.g. acp_session_update streaming chunks).
 */
export const subscribe = os.handler(async function* () {
  yield* createEventIterator();
});
