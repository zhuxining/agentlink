import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

class ResizeObserverMock {
  observe() {
    /* noop */
  }
  unobserve() {
    /* noop */
  }
  disconnect() {
    /* noop */
  }
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);

vi.mock("@chat-adapter/web/react", () => ({
  useChat: vi.fn(),
}));

vi.mock("@/hooks/use-web-endpoint", () => ({
  useWebEndpoint: () => ({
    data: "http://127.0.0.1:53721/api/chat",
  }),
}));

import { useChat } from "@chat-adapter/web/react";
import { WebChat } from "@/components/conversation/web-chat";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("WebChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders text parts of messages via MessageResponse", () => {
    (useChat as ReturnType<typeof vi.fn>).mockReturnValue({
      error: null,
      messages: [
        {
          id: "m1",
          parts: [{ text: "hello world", type: "text" }],
          role: "user",
        },
      ] as unknown as UIMessage[],
      sendMessage: vi.fn(),
      status: "ready",
      stop: vi.fn(),
    });
    render(<WebChat initialMessages={[]} threadId="web:local:abc" />, {
      wrapper,
    });
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("shows Shimmer when busy and last message is not assistant", () => {
    (useChat as ReturnType<typeof vi.fn>).mockReturnValue({
      error: null,
      messages: [
        { id: "m1", parts: [{ text: "q", type: "text" }], role: "user" },
      ] as unknown as UIMessage[],
      sendMessage: vi.fn(),
      status: "submitted",
      stop: vi.fn(),
    });
    render(<WebChat initialMessages={[]} threadId="web:local:abc" />, {
      wrapper,
    });
    expect(screen.getByText("正在思考...")).toBeInTheDocument();
  });

  it("shows error message in destructive style when error set", () => {
    (useChat as ReturnType<typeof vi.fn>).mockReturnValue({
      error: new Error("boom"),
      messages: [] as UIMessage[],
      sendMessage: vi.fn(),
      status: "ready",
      stop: vi.fn(),
    });
    render(<WebChat initialMessages={[]} threadId="web:local:abc" />, {
      wrapper,
    });
    expect(screen.getByText("boom")).toBeInTheDocument();
  });
});
