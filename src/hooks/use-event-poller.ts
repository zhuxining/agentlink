import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getRecentEvents } from "@/actions/events";

export type { AppEvent } from "@/ipc/events/event-types";

const POLL_INTERVAL = 3000;

export function useRecentEvents() {
  return useQuery({
    queryFn: getRecentEvents,
    queryKey: ["events", "recent"],
    refetchInterval: POLL_INTERVAL,
  });
}

export function useEventPoller() {
  const queryClient = useQueryClient();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      // 拉取事件并自动 invalidate 相关 query
      try {
        const events = await getRecentEvents();
        for (const event of events) {
          const t = event.type;
          if (
            t === "message_received" ||
            t === "message_sent" ||
            t === "agent_error"
          ) {
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            queryClient.invalidateQueries({ queryKey: ["messages"] });
          } else if (t === "adapter_status_changed") {
            queryClient.invalidateQueries({ queryKey: ["channels"] });
          } else if (t === "acp_server_status_changed") {
            queryClient.invalidateQueries({ queryKey: ["acp", "servers"] });
          }
        }
      } catch {
        /* ignore poll errors */
      }
    }, POLL_INTERVAL);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [queryClient]);
}
