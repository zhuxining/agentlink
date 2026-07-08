import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  disableAdapter,
  enableAdapter,
  listAdapters,
  listEnabledAdapters,
} from "@/actions/channel";

export function useAdapters() {
  return useQuery({
    queryFn: listAdapters,
    queryKey: ["channels", "adapters"],
  });
}

export function useEnabledAdapters() {
  return useQuery({
    queryFn: listEnabledAdapters,
    queryKey: ["channels", "enabled-adapters"],
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
