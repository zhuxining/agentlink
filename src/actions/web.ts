import { ipc } from "@/ipc/manager";

export function getEndpoint(): Promise<string> {
  return ipc.client.web.getEndpoint() as Promise<string>;
}
