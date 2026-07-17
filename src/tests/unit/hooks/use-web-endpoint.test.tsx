import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ipc/manager", () => ({
  ipc: {
    client: {
      web: {
        getEndpoint: vi.fn(),
      },
    },
  },
}));

import { useWebEndpoint } from "@/hooks/use-web-endpoint";
import { ipc } from "@/ipc/manager";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useWebEndpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns endpoint string from ipc.client.web.getEndpoint", async () => {
    (ipc.client.web.getEndpoint as ReturnType<typeof vi.fn>).mockResolvedValue(
      "http://127.0.0.1:53721/api/chat"
    );
    const { result } = renderHook(() => useWebEndpoint(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toBe("http://127.0.0.1:53721/api/chat");
  });
});
