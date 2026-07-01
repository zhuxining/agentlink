import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { AppEvent } from "@/hooks/use-event-poller";
import { useRecentEvents } from "@/hooks/use-event-poller";

function showAdapterToast(event: AppEvent, seen: Set<string>) {
  if (event.type !== "adapter_status_changed") {
    return;
  }
  const key = `${event.adapter}:${event.status}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);

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
}

export function AdapterToaster() {
  const { data: events } = useRecentEvents();
  const seenRef = useRef(new Set<string>());

  useEffect(() => {
    if (!events) {
      return;
    }
    for (const event of events) {
      showAdapterToast(event, seenRef.current);
    }
    // Prevent unbounded growth: evict oldest entry when over limit
    if (seenRef.current.size > 200) {
      const oldest = seenRef.current.values().next().value;
      if (oldest !== undefined) {
        seenRef.current.delete(oldest);
      }
    }
  }, [events]);

  return null;
}
