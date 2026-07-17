import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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

vi.mock("@/hooks/use-conversations", () => ({
  useConversation: vi.fn(),
  useMessages: vi.fn(),
}));

vi.mock("@/components/conversation/web-chat", () => ({
  WebChat: () => <div data-testid="web-chat" />,
}));

vi.mock("@/components/conversation/im-chat", () => ({
  IMChat: () => <div data-testid="im-chat" />,
}));

const LOADING_TEXT = /加载中/;

import { MessagePanel } from "@/components/conversation/message-panel";
import { useConversation, useMessages } from "@/hooks/use-conversations";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("MessagePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders WebChat when adapter is 'web'", () => {
    (useConversation as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { adapter: "web", id: "web:local:a" },
    });
    (useMessages as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
    });
    render(<MessagePanel conversationId="web:local:a" />, { wrapper });
    expect(screen.getByTestId("web-chat")).toBeInTheDocument();
  });

  it("renders IMChat for non-web adapter", () => {
    (useConversation as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { adapter: "telegram", id: "t-1" },
    });
    (useMessages as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
    });
    render(<MessagePanel conversationId="t-1" />, { wrapper });
    expect(screen.getByTestId("im-chat")).toBeInTheDocument();
  });

  it("shows loading state when conversation not loaded", () => {
    (useConversation as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
    });
    (useMessages as ReturnType<typeof vi.fn>).mockReturnValue({
      isLoading: true,
    });
    render(<MessagePanel conversationId="t-1" />, { wrapper });
    expect(screen.getByText(LOADING_TEXT)).toBeInTheDocument();
  });
});
