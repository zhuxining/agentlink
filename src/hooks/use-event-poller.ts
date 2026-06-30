import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getRecentEvents } from "@/actions/events";

export type { AppEvent } from "@/ipc/events/event-types";

const POLL_INTERVAL = 3000;

export function useRecentEvents() {
  return useQuery({
    queryKey: ["events", "recent"],
    queryFn: getRecentEvents,
    refetchInterval: POLL_INTERVAL,
  });
}

export function useEventPoller() {
  const queryClient = useQueryClient();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["events", "recent"] });
    }, POLL_INTERVAL);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [queryClient]);
}

export type { AppEvent };
