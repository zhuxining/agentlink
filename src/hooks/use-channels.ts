import { useMutation, useQuery } from "@tanstack/react-query";
import {
  disableAdapter,
  enableAdapter,
  listAdapters,
  listEnabledAdapters,
} from "@/actions/channel";

export function useAdapters() {
  return useQuery({
    queryKey: ["channels", "adapters"],
    queryFn: listAdapters,
  });
}

export function useEnabledAdapters() {
  return useQuery({
    queryKey: ["channels", "enabled-adapters"],
    queryFn: listEnabledAdapters,
  });
}

export function useEnableAdapter() {
  return useMutation({
    mutationFn: ({
      slug,
      env,
    }: {
      slug: string;
      env: Record<string, string>;
    }) => enableAdapter(slug, env),
  });
}

export function useDisableAdapter() {
  return useMutation({
    mutationFn: ({ slug }: { slug: string }) => disableAdapter(slug),
  });
}
