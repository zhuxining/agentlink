import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/hooks/use-conversations", () => ({
  useConversations: () => ({ data: [], isLoading: false }),
}));

import { ConversationList } from "@/components/conversation/conversation-list";

const NEW_BUTTON_NAME = /新建会话/;

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("ConversationList", () => {
  it("renders new conversation button", () => {
    render(<ConversationList />, { wrapper });
    expect(
      screen.getByRole("button", { name: NEW_BUTTON_NAME })
    ).toBeInTheDocument();
  });
});
