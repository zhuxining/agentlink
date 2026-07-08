import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("@/actions/theme", () => ({
  toggleTheme: vi.fn(),
  getCurrentTheme: vi.fn(),
  setTheme: vi.fn(),
  syncWithLocalTheme: vi.fn(),
}));

import ToggleTheme from "@/components/toggle-theme";

test("renders a button with an icon", () => {
  const { getByRole } = render(<ToggleTheme />);
  const button = getByRole("button");
  const icon = button.querySelector("svg");

  expect(button).toBeInTheDocument();
  expect(icon).toBeInTheDocument();
});
