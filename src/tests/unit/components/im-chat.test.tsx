import { render, screen } from "@testing-library/react";
import type { UIMessage } from "ai";
import { describe, expect, it, vi } from "vitest";
import { IMChat } from "@/components/conversation/im-chat";

const EMPTY_STATE_REGEX = /此 telegram 会话暂无消息/;

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

describe("IMChat", () => {
  it("shows empty state when no messages", () => {
    render(<IMChat adapterName="telegram" initialMessages={[]} />);
    expect(screen.getByText(EMPTY_STATE_REGEX)).toBeInTheDocument();
  });

  it("renders text parts via MessageResponse and has no input", () => {
    const messages: UIMessage[] = [
      {
        id: "m1",
        parts: [{ text: "hi from telegram", type: "text" }],
        role: "user",
      },
    ];
    const { container } = render(
      <IMChat adapterName="telegram" initialMessages={messages} />
    );
    expect(screen.getByText("hi from telegram")).toBeInTheDocument();
    expect(container.querySelector("textarea")).toBeNull();
  });
});
