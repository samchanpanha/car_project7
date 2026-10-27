/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button component", () => {
  it("renders children and applies variant", () => {
    render(<Button variant="default">Save</Button>);
    const btn = screen.getByRole("button", { name: /save/i });
    expect(btn).toBeInTheDocument();
  });
});