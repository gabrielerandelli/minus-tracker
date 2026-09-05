import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { runCalc } from "../src/cli/commands/calc.js";
import { buildReport, formatJson } from "../src/stress/reporter.js";
import type { ScenarioResult } from "../src/stress/runner.js";
import { it as itStrings } from "../src/i18n/it.js";
import { stripAnsi } from "../src/cli/colors.js";

/**
 * Task 63 acceptance test — written but NOT executed, per explicit instruction
 * (2026-09-05 spec-pipeline-execute run for spec-plan/b2373c7). See
 * docs/new-workflow-problems.md in minus-tracker-dev. Run this before trusting
 * it — it has never been executed and may need adjustment.
 *
 * TC-232: `--json` output is never colorized, regardless of TTY/color state.
 * docs/test_plan/24-cli-color-output.md is explicit that this holds "by
 * construction" — `calc --json`/`stress-test --json` use JSON.stringify()/
 * formatJson(), a separate serialization path from renderReport()/
 * formatTable(), so there is no color branch to suppress in the first place.
 *
 * `calc`'s `color` parameter is passed as `true` below to simulate "TTY forced
 * on, no --no-color/NO_COLOR" per the TC's own Test Data — the real CLI entry
 * point (src/cli/index.ts) derives that same boolean from stdout.isTTY before
 * calling runCalc, so passing it directly here exercises the same code path
 * runCli would reach under those conditions.
 */

let tmpDirs: string[] = [];
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tc232-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("TC-232: --json is never colorized", () => {
  it("calc --json under color-on conditions → valid JSON, zero ANSI escapes", async () => {
    const dir = makeTmpDir();
    const fixturePath = path.join(dir, "valid-trades.csv");
    fs.copyFileSync(
      path.join(__dirname, "fixtures/valid-trades.csv"),
      fixturePath,
    );

    let stdoutBuf = "";
    const mockStdout = new Writable({
      write(chunk, _enc, cb) {
        stdoutBuf += chunk.toString();
        cb();
      },
    });
    const mockStderr = new Writable({
      write(_chunk, _enc, cb) {
        cb();
      },
    });

    const exitCode = await runCalc(
      [fixturePath],
      { json: true },
      itStrings,
      mockStdout,
      mockStderr,
      true, // color forced on — must have no effect on the --json path
    );

    expect(exitCode).toBe(0);
    expect(stdoutBuf).toBe(stripAnsi(stdoutBuf));
    expect(() => JSON.parse(stdoutBuf)).not.toThrow();
  });

  it("stress-test --json (reporter.ts's formatJson()) → valid JSON, zero ANSI escapes", () => {
    const result: ScenarioResult = {
      id: "001",
      category: "01-eur-gains",
      slug: "test",
      description: "Test scenario",
      csvFile: "/tmp/test.csv",
      results: [
        { cmd: "calc", exitCode: 0, stdout: "", stderr: "", pass: true },
      ],
      pass: true,
      warningCheckPass: true,
      expectedWarningCount: 0,
      actualWarningCount: 0,
    };
    const report = buildReport([result], 1, 0);

    // formatJson() takes no `color` parameter at all — there is no branch to
    // force on, which is itself part of what TC-232 is checking (colorization
    // is out of scope "by construction", not a special-cased flag check).
    const json = formatJson(report);

    expect(json).toBe(stripAnsi(json));
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
