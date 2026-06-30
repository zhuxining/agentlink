import type { AcpServerStatus } from "@/ipc/acp/schemas";
import { ipc } from "@/ipc/manager";

export function listAcpServers(): Promise<AcpServerStatus[]> {
  return ipc.client.acp.listAcpServers();
}
export function addAcpServer(config: {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}): Promise<{ success: boolean }> {
  return ipc.client.acp.addAcpServer(config);
}
export function removeAcpServer(id: string): Promise<{ success: boolean }> {
  return ipc.client.acp.removeAcpServer({ id });
}
export function connectAcpServer(id: string): Promise<{ success: boolean }> {
  return ipc.client.acp.connectAcpServer({ id });
}
export function disconnectAcpServer(id: string): Promise<{ success: boolean }> {
  return ipc.client.acp.disconnectAcpServer({ id });
}
