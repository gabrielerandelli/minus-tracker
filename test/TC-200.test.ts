/**
 * TC-200: `--no-color` alone (TTY attached, `NO_COLOR` unset) disables color.
 *
 * `--no-color` is the highest-priority entry in the v0.12.0 color
 * resolution order — it forces color off regardless of TTY/`NO_COLOR`
 * state. Verified via `--version` (the one code path that already
 * colorizes, through `banner.ts`'s truecolor gradient) since Task 57 is
 * pure flag-parsing/parameter-threading plumbing — the per-command
 * coloring itself (`calc`, `validate`, ...) lands in later tasks.
 */
import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import { runCli } from "../src/cli/index.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceFixture = path.join(__dirname, "fixtures/valid-trades.csv");

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

describe("TC-200: --no-color alone (TTY, no NO_COLOR) disables color", () => {
  it("suppresses ANSI escapes even with a TTY attached", async () => {
    const out = captureStream();
    (out.stream as unknown as { isTTY: boolean }).isTTY = true;
    const err = captureStream();

    const code = await runCli(["--no-color", "--version"], out.stream, err.stream);

    expect(code).toBe(0);
    expect(out.output()).not.toMatch(/\x1b\[/);
  });

  it("is accepted as a global flag ahead of a real command (calc)", async () => {
    // Private temp copy so calc's auto-classify sidecar write doesn't land
    // in the committed test/fixtures/ directory (same isolation as TC-027).
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tc200-"));
    const fixturePath = path.join(tmpDir, "valid-trades.csv");
    fs.copyFileSync(sourceFixture, fixturePath);

    const out = captureStream();
    (out.stream as unknown as { isTTY: boolean }).isTTY = true;
    const err = captureStream();

    const code = await runCli(
      ["calc", "--no-color", "--offline", fixturePath],
      out.stream,
      err.stream,
    );

    expect(code).toBe(0);
    expect(out.output()).not.toMatch(/\x1b\[/);
  });
});
