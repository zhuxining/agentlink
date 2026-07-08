import { useMutation, useQuery } from "@tanstack/react-query";
import {
  addAcpServer,
  connectAcpServer,
  disconnectAcpServer,
  listAcpServers,
  removeAcpServer,
} from "@/actions/acp";

export function useAcpServers() {
  return useQuery({
    queryFn: listAcpServers,
    queryKey: ["acp", "servers"],
  });
}

export function useAddAcpServer() {
  return useMutation({
    mutationFn: (config: {
      id: string;
      name: string;
      command: string;
      args: string[];
      env?: Record<string, string>;
    }) => addAcpServer(config),
  });
}

export function useRemoveAcpServer() {
  return useMutation({
    mutationFn: ({ id }: { id: string }) => removeAcpServer(id),
  });
}

export function useConnectAcpServer() {
  return useMutation({
    mutationFn: ({ id }: { id: string }) => connectAcpServer(id),
  });
}

export function useDisconnectAcpServer() {
  return useMutation({
    mutationFn: ({ id }: { id: string }) => disconnectAcpServer(id),
  });
}
