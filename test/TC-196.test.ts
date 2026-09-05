import { describe, it, expect } from "vitest";
import { stripAnsi as stripAnsiFromColors } from "../src/cli/colors.js";
import { renderBanner, stripAnsi as stripAnsiFromBanner } from "../src/cli/banner.js";

/**
 * TC-196: `stripAnsi` extracted to `colors.ts`, banner behavior unchanged
 *
 * Part 18 (CLI Color Output) — Task 56 (Shared Color Infrastructure).
 *
 * `stripAnsi` now lives in `colors.ts`; `banner.ts` re-exports the exact same function
 * (not a re-implementation) so its own narrow-terminal fallback path — which calls
 * `stripAnsi` internally to decide which lines are blank after coloring — and any
 * existing external import of `stripAnsi` from `banner.ts` both keep working unchanged.
 */

describe("TC-196: stripAnsi extracted to colors.ts", () => {
  it("removes truecolor escape sequences", () => {
    expect(stripAnsiFromColors("\x1b[38;2;27;73;101mA\x1b[0m")).toBe("A");
  });

  it("is a no-op on plain text", () => {
    expect(stripAnsiFromColors("plain text")).toBe("plain text");
  });

  it("banner.ts re-exports the identical function reference from colors.ts", () => {
    expect(stripAnsiFromBanner).toBe(stripAnsiFromColors);
  });

  it("banner.ts's narrow-terminal fallback path (which calls stripAnsi internally) is unaffected", () => {
    const output = renderBanner({
      mode: "full",
      tagline: "Italian Capital Gains & Losses Tracker",
      version: "0.9.0",
      color: true,
      width: 20,
    });
    // Fallback path only keeps lines whose stripped content is non-blank.
    expect(output.split("\n").every((l) => stripAnsiFromColors(l).trim().length > 0)).toBe(
      true,
    );
    expect(stripAnsiFromColors(output)).toContain("minus-tracker");
  });
});
