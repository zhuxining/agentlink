import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      slug,
      env,
    }: {
      slug: string;
      env: Record<string, string>;
    }) => enableAdapter(slug, env),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });
}

export function useDisableAdapter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug }: { slug: string }) => disableAdapter(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });
}
