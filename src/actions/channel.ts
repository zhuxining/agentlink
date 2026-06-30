import type { AdapterStatus } from "@/ipc/channel/schemas";
import { ipc } from "@/ipc/manager";

export function listAdapters(): Promise<AdapterStatus[]> {
  return ipc.client.channel.listAdapters() as Promise<AdapterStatus[]>;
}
export function listEnabledAdapters(): Promise<AdapterStatus[]> {
  return ipc.client.channel.listEnabledAdapters() as Promise<AdapterStatus[]>;
}
export function enableAdapter(
  slug: string,
  env: Record<string, string>
): Promise<{ success: boolean }> {
  return ipc.client.channel.enableAdapter({ slug, env });
}
export function disableAdapter(slug: string): Promise<{ success: boolean }> {
  return ipc.client.channel.disableAdapter({ slug });
}
