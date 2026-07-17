import { useQuery } from "@tanstack/react-query";
import { getEndpoint } from "@/actions/web";

export function useWebEndpoint() {
  return useQuery({
    queryFn: () => getEndpoint(),
    queryKey: ["webEndpoint"],
    staleTime: Number.POSITIVE_INFINITY,
  });
}
