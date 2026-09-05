/**
 * TC-202: Non-TTY stdout disables color with no flags set (regression
 * guard).
 *
 * Piped/redirected output (not a TTY) disables color even with neither
 * `--no-color` nor `NO_COLOR` set — the pre-existing v0.10.0 rule, now
 * priority 3 in the v0.12.0 resolution order. Scripts piping CLI output
 * are unaffected by this feature by default, without needing
 * `--no-color`.
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

describe("TC-202: non-TTY stdout disables color with no flags (regression guard)", () => {
  const originalNoColor = process.env["NO_COLOR"];

  beforeEach(() => {
    delete process.env["NO_COLOR"];
  });

  afterEach(() => {
    if (originalNoColor !== undefined) {
      process.env["NO_COLOR"] = originalNoColor;
    }
  });

  it("suppresses ANSI escapes when stdout does not report isTTY", async () => {
    const out = captureStream();
    // captureStream()'s Writable has no isTTY set at all — this simulates
    // a piped/redirected stdout (e.g. `minus-tracker calc file.csv > out.txt`).
    const err = captureStream();

    const code = await runCli(["--version"], out.stream, err.stream);

    expect(code).toBe(0);
    expect(out.output()).not.toMatch(/\x1b\[/);
  });
});
