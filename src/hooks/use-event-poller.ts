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
    intervalRef.current = setInterval(async () => {
      // 拉取事件并自动 invalidate 相关 query
      try {
        const events = await getRecentEvents();
        for (const event of events) {
          switch (event.type) {
            case "message_received":
            case "message_sent":
            case "agent_error":
              queryClient.invalidateQueries({ queryKey: ["conversations"] });
              queryClient.invalidateQueries({ queryKey: ["messages"] });
              break;
            case "adapter_status_changed":
              queryClient.invalidateQueries({ queryKey: ["channels"] });
              break;
            case "acp_server_status_changed":
              queryClient.invalidateQueries({ queryKey: ["acp", "servers"] });
              break;
            default:
              break;
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
