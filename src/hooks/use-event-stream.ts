// src/hooks/use-event-stream.ts
import { useEffect, useRef } from "react";
import type { AppEvent } from "@/ipc/events/event-types";
import { ipc } from "@/ipc/manager";

/**
 * Subscribe to real-time events via oRPC streaming subscription.
 * The onEvent callback is called for each event as it arrives.
 * Cleaned up automatically on unmount.
 */
export function useEventStream(onEvent: (event: AppEvent) => void): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let cancelled = false;
    let iterator: AsyncGenerator<AppEvent> | null = null;

    void (async () => {
      try {
        iterator = (await ipc.client.events.subscribe()) as AsyncGenerator<AppEvent>;
        for await (const event of iterator) {
          if (cancelled) {
            break;
          }
          handlerRef.current(event);
        }
      } catch {
        // subscription closed or error - ignore
      }
    })();

    return () => {
      cancelled = true;
      void iterator?.return(undefined);
    };
  }, []);
}
