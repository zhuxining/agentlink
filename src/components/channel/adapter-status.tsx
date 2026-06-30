import { Badge } from "@/components/ui/badge";

interface Props {
  error?: string;
  status: string;
}

const STATUS_MAP: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  connected: "default",
  connecting: "secondary",
  error: "destructive",
};

export function AdapterStatus({ status, error }: Props) {
  const variant = STATUS_MAP[status] ?? "outline";

  let label: string;
  if (status === "connecting") {
    label = "连接中...";
  } else if (status === "connected") {
    label = "已连接";
  } else if (status === "error") {
    label = `错误: ${error ?? "未知"}`;
  } else {
    label = "未连接";
  }
  return (
    <Badge className="text-xs" variant={variant}>
      {label}
    </Badge>
  );
}
