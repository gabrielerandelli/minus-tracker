/**
 * TC-203: `--no-color` and `NO_COLOR` both set → still off
 * (redundant-but-consistent).
 *
 * The two highest-priority color-off signals stacking does not toggle
 * color back on — there is no double-negation in the resolution order.
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

describe("TC-203: --no-color + NO_COLOR both set → still off", () => {
  const originalNoColor = process.env["NO_COLOR"];

  beforeEach(() => {
    process.env["NO_COLOR"] = "1";
  });

  afterEach(() => {
    if (originalNoColor === undefined) {
      delete process.env["NO_COLOR"];
    } else {
      process.env["NO_COLOR"] = originalNoColor;
    }
  });

  it("suppresses ANSI escapes with redundant color-off signals stacked", async () => {
    const out = captureStream();
    (out.stream as unknown as { isTTY: boolean }).isTTY = true;
    const err = captureStream();

    const code = await runCli(["--no-color", "--version"], out.stream, err.stream);

    expect(code).toBe(0);
    expect(out.output()).not.toMatch(/\x1b\[/);
  });
});
