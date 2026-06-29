import { describe, it, expect, vi, afterEach } from "vitest";
import { Writable } from "node:stream";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runClassify } from "../src/cli/commands/classify.js";
import { it as itStrings } from "../src/i18n/it.js";

/**
 * TC-065: classify command — non-TTY stdin without --offline → exit 2
 *
 * When process.stdin.isTTY is falsy (piped input / test environment) and
 * --offline is not set, the command must:
 *   - write classifyNonTtyError to stderr
 *   - return exit code 2
 *   - write nothing to stdout
 *
 * This guards against accidentally launching the interactive classification
 * flow in a headless/CI environment.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures/valid-trades.csv");

afterEach(() => vi.restoreAllMocks());

describe("TC-065: classify — non-TTY without --offline → stderr error, exit 2", () => {
  it("returns exit code 2 when stdin is not a TTY and offline=false", async () => {
    // Ensure isTTY is falsy (it already is in test environments, but be explicit)
    Object.defineProperty(process.stdin, "isTTY", {
      value: undefined,
      configurable: true,
    });

    let stdoutOutput = "";
    let stderrOutput = "";

    const mockStdout = new Writable({
      write(chunk, _, cb) {
        stdoutOutput += chunk.toString();
        cb();
      },
    });

    const mockStderr = new Writable({
      write(chunk, _, cb) {
        stderrOutput += chunk.toString();
        cb();
      },
    });

    const exitCode = await runClassify(
      [fixturePath],
      { offline: false },
      itStrings,
      mockStdout,
      mockStderr,
    );

    expect(exitCode).toBe(2);
    expect(stderrOutput).toContain(itStrings.classifyNonTtyError);
    expect(stdoutOutput).toBe("");
  });

  it("stderr message mentions TTY and --offline", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: undefined,
      configurable: true,
    });

    let stderrOutput = "";
    const mockStderr = new Writable({
      write(chunk, _, cb) {
        stderrOutput += chunk.toString();
        cb();
      },
    });
    const mockStdout = new Writable({
      write(_, __, cb) {
        cb();
      },
    });

    await runClassify(
      [fixturePath],
      { offline: false },
      itStrings,
      mockStdout,
      mockStderr,
    );

    // The Italian message mentions "TTY" and "--offline"
    expect(stderrOutput.toLowerCase()).toMatch(/tty/i);
    expect(stderrOutput).toContain("--offline");
  });
});
