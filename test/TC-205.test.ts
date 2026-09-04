/**
 * TC-205: The single startup-computed `color` boolean is reused for
 * stderr banner writes (regression guard).
 *
 * `src/cli/index.ts` computes one `color: boolean` once, from stdout's
 * TTY/`NO_COLOR`/`--no-color` state, and reuses it for the
 * bare-invocation banner written to stderr — this is an existing,
 * intentional simplification carried forward unchanged, not a new gap
 * introduced by adding `--no-color`.
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

describe("TC-205: single startup color boolean reused for stderr banner (regression guard)", () => {
  const originalNoColor = process.env["NO_COLOR"];

  beforeEach(() => {
    delete process.env["NO_COLOR"];
  });

  afterEach(() => {
    if (originalNoColor !== undefined) {
      process.env["NO_COLOR"] = originalNoColor;
    }
  });

  it("colors the stderr bare-invocation banner per stdout's TTY state, not stderr's own", async () => {
    const out = captureStream();
    (out.stream as unknown as { isTTY: boolean }).isTTY = true;
    const err = captureStream();
    // err.stream deliberately has no isTTY set — simulates
    // `minus-tracker 2>out.txt` where stdout stays attached to a terminal
    // but stderr is redirected.

    const code = await runCli([], out.stream, err.stream);

    expect(code).toBe(2);
    expect(out.output()).toBe("");
    expect(err.output()).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
  });
});
