import { describe, it, expect } from "vitest";
import { colorize } from "../src/cli/colors.js";

/**
 * TC-195: `colorize(text, hex, enabled)` wraps/no-ops correctly
 *
 * Part 18 (CLI Color Output) — Task 56 (Shared Color Infrastructure).
 */

describe("TC-195: colorize()", () => {
  it("wraps text in a truecolor escape + RESET when enabled", () => {
    const out = colorize("hello", "#1B4965", true);
    expect(out).toBe("\x1b[38;2;27;73;101mhello\x1b[0m");
  });

  it("returns text unchanged when disabled", () => {
    expect(colorize("hello", "#1B4965", false)).toBe("hello");
  });

  it("accepts a hex string without a leading #", () => {
    const withHash = colorize("x", "#4ADE80", true);
    const withoutHash = colorize("x", "4ADE80", true);
    expect(withoutHash).toBe(withHash);
  });

  it("no-ops on an empty string", () => {
    expect(colorize("", "#F87171", false)).toBe("");
  });

  it("wraps an empty string when enabled (still produces valid escape+reset)", () => {
    expect(colorize("", "#F87171", true)).toBe("\x1b[38;2;248;113;113m\x1b[0m");
  });
});
