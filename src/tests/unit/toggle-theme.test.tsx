import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import ToggleTheme from "@/components/toggle-theme";

test("renders a button with an icon", () => {
  const { getByRole } = render(<ToggleTheme />);
  const button = getByRole("button");
  const icon = button.querySelector("svg");

  expect(button).toBeInTheDocument();
  expect(icon).toBeInTheDocument();
});
