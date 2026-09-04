/**
 * TC-204: TTY attached, no flags/env set → color on.
 *
 * The positive case at the bottom of the resolution order: with none of
 * the three color-off conditions true, color is enabled — unchanged from
 * v0.10.0's own TTY-detection default, now shared by every command
 * instead of just the banner. Verified via `--version` (the one code
 * path that already colorizes through `banner.ts`'s truecolor gradient);
 * per-command coloring for `calc`'s table/GAIN-LOSS output lands in
 * Task 58, downstream of this task's pure plumbing.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Writable } from "node:stream";
import { runCli } from "../src/cli/index.js";

function captureStream(): { stream: Writable; output: () => string } {
  let buf = "";
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  return { stream, output: () => buf };
}

describe("TC-204: TTY attached, no flags/env set → color on", () => {
  const originalNoColor = process.env["NO_COLOR"];

  beforeEach(() => {
    delete process.env["NO_COLOR"];
  });

  afterEach(() => {
    if (originalNoColor !== undefined) {
      process.env["NO_COLOR"] = originalNoColor;
    }
  });

  it("emits ANSI truecolor escapes when none of the three color-off conditions hold", async () => {
    const out = captureStream();
    (out.stream as unknown as { isTTY: boolean }).isTTY = true;
    const err = captureStream();

    const code = await runCli(["--version"], out.stream, err.stream);

    expect(code).toBe(0);
    expect(out.output()).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
  });
});
