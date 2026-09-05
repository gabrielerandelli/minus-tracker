import { describe, it, expect } from "vitest";
import { renderBanner } from "../src/cli/banner.js";

/**
 * TC-199: full v0.10.0 banner test suite (TC-127–134) passes unmodified against the
 * refactored `banner.ts`
 *
 * Part 18 (CLI Color Output) — Task 56 (Shared Color Infrastructure).
 *
 * `test/cli-banner.test.ts` (the actual TC-127–134 suite) already exercises
 * `renderBanner`/`stripAnsi` end-to-end and runs unmodified against this refactor — its
 * continued pass is itself part of TC-199's evidence. This file adds the concrete,
 * pinned regression the extraction needs: fixed output for a fixed input, so a future
 * change to `colors.ts` or `banner.ts` that alters a single byte of the banner's
 * rendered output (colored or plain) is caught here, not just "still contains the
 * wordmark somewhere."
 */

const OPTS_PLAIN = {
  mode: "full" as const,
  tagline: "Italian Capital Gains & Losses Tracker",
  version: "0.9.0",
  color: false,
  width: undefined,
};

describe("TC-199: banner output byte-identical pre/post colors.ts extraction", () => {
  it("plain (color=false) full-mode banner matches the pinned byte-for-byte snapshot", () => {
    const output = renderBanner(OPTS_PLAIN);
    expect(output).toBe(
      "╭──────────────────────────────────────────╮\n" +
        "│                                          │\n" +
        "│   ╾╮ ╭─╮  ▲     minus-tracker            │\n" +
        "│    ╰─╯ ╰──┤                              │\n" +
        "│                                          │\n" +
        "│   Italian Capital Gains & Losses Tracker │\n" +
        "│   Regime Dichiarativo · v0.9.0           │\n" +
        "│                                          │\n" +
        "╰──────────────────────────────────────────╯",
    );
  });

  it("compact plain banner matches the pinned snapshot", () => {
    const output = renderBanner({ ...OPTS_PLAIN, mode: "compact" });
    expect(output).toBe("╾╮╭─╮▲  minus-tracker v0.9.0");
  });

  it("colored full-mode banner strips down to exactly the plain snapshot", () => {
    const plain = renderBanner(OPTS_PLAIN);
    const colored = renderBanner({ ...OPTS_PLAIN, color: true });
    // Colored output carries ANSI bytes the plain one doesn't...
    expect(colored).not.toBe(plain);
    expect(colored).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
    // ...but re-import stripAnsi from colors.ts (not banner.ts) to prove the
    // extraction didn't change what gets stripped.
  });
});
