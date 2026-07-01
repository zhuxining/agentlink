import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useRecentEvents } from "@/hooks/use-event-poller";

export function AdapterToaster() {
  const { data: events } = useRecentEvents();
  const seenRef = useRef(new Set<string>());

  useEffect(() => {
    if (!events) return;
    for (const event of events) {
      if (event.type !== "adapter_status_changed") continue;
      const key = `${event.adapter}:${event.status}`;
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);

      if (event.status === "connected") {
        toast.success(`${event.adapter} 已连接`, {
          description: "适配器连接成功",
        });
      } else if (event.status === "error") {
        toast.error(`${event.adapter} 连接失败`, {
          description: event.error ?? "未知错误",
          duration: 8000,
        });
      }
      // Periodically clean up old keys to avoid unbounded growth
      if (seenRef.current.size > 100) seenRef.current.clear();
    }
  }, [events]);

  return null;
}
