/**
 * TC-201: `NO_COLOR` env var disables color exactly as it did pre-v0.12.0
 * (regression guard).
 *
 * With `--no-color` absent, `NO_COLOR` set, and stdout a TTY, color is
 * still off — identical to the v0.10.0 banner behavior the v0.12.0
 * resolution order is built on top of.
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

describe("TC-201: NO_COLOR env disables color (regression guard)", () => {
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

  it("suppresses ANSI escapes with NO_COLOR set, even with a TTY attached and no --no-color", async () => {
    const out = captureStream();
    (out.stream as unknown as { isTTY: boolean }).isTTY = true;
    const err = captureStream();

    const code = await runCli(["--version"], out.stream, err.stream);

    expect(code).toBe(0);
    expect(out.output()).not.toMatch(/\x1b\[/);
  });
});
