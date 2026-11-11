import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runCalc } from "../src/cli/commands/calc.js";
import { en as enStrings } from "../src/i18n/en.js";

/**
 * Regression test for a bug where "--year <garbage>" silently produced a
 * structurally-valid but completely wrong zero-everything report with exit
 * code 0, instead of a usage error.
 *
 * Root cause: parseInt("abc", 10) === NaN flowed straight into
 * CalculatorOptions.taxYear, which Calculator.calculateGains() treats as an
 * authoritative, explicit tax year (short-circuiting inference). The
 * tax-year scoping filter then compared every lot's year against NaN, which
 * is never === anything, so every lot was filtered out — producing a report
 * with plusvalenze/minusvalenze/netResult all 0 and an empty lots array,
 * with NO warning or error, even though the shared valid-trades.csv fixture
 * (Apple Inc, 1 BUY 10x150 EUR fees=2, 1 SELL 10x180 EUR fees=2) has a real
 * 296 EUR gain.
 *
 * Every other constrained flag this function parses (--method, --broker,
 * --carry-forward) already validates its input and bails with exit code 2
 * on a bad value. --year must do the same: validate it is a well-formed
 * 4-digit calendar year (docs/prd/06-cli.md's documented <YYYY> contract)
 * BEFORE trusting parseInt(yearFlag, 10) downstream.
 *
 * Follows TC-027.test.ts's convention of copying the shared fixture into a
 * private temp dir per run, so calc's auto-classify sidecar write never
 * lands in the committed test/fixtures/ directory.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceFixture = path.join(__dirname, "fixtures/valid-trades.csv");

interface CaptureResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

let tmpDirs: string[] = [];
function makeTmpFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-year-"));
  tmpDirs.push(dir);
  const fixturePath = path.join(dir, "valid-trades.csv");
  fs.copyFileSync(sourceFixture, fixturePath);
  return fixturePath;
}
afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

async function runCalcCapture(
  args: string[],
  flags: Record<string, string | boolean>,
): Promise<CaptureResult> {
  let stdoutBuf = "";
  let stderrBuf = "";
  const mockStdout = new Writable({
    write(chunk, _enc, cb) {
      stdoutBuf += chunk.toString();
      cb();
    },
  });
  const mockStderr = new Writable({
    write(chunk, _enc, cb) {
      stderrBuf += chunk.toString();
      cb();
    },
  });
  const exitCode = await runCalc(
    args,
    flags,
    enStrings,
    mockStdout,
    mockStderr,
    false,
  );
  return { exitCode, stdout: stdoutBuf, stderr: stderrBuf };
}

describe("regression: calc --year rejects malformed values", () => {
  it("rejects a non-numeric --year value (exit 2, clear stderr, no silent zero report)", async () => {
    const fixturePath = makeTmpFixture();
    const result = await runCalcCapture([fixturePath], {
      year: "abc",
      offline: true,
      json: true,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(enStrings.yearInvalidFormat);

    // Nothing resembling a silently-zeroed "valid" report should ever have
    // reached stdout.
    expect(result.stdout).toBe("");
  });

  it("rejects a non-4-digit --year value (e.g. '203')", async () => {
    const fixturePath = makeTmpFixture();
    const result = await runCalcCapture([fixturePath], {
      year: "203",
      offline: true,
      json: true,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(enStrings.yearInvalidFormat);
    expect(result.stdout).toBe("");
  });

  it("rejects a negative --year value (e.g. '-5')", async () => {
    const fixturePath = makeTmpFixture();
    const result = await runCalcCapture([fixturePath], {
      year: "-5",
      offline: true,
      json: true,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(enStrings.yearInvalidFormat);
    expect(result.stdout).toBe("");
  });

  it("rejects a non-integer --year value (e.g. '2024.5')", async () => {
    const fixturePath = makeTmpFixture();
    const result = await runCalcCapture([fixturePath], {
      year: "2024.5",
      offline: true,
      json: true,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(enStrings.yearInvalidFormat);
    expect(result.stdout).toBe("");
  });

  it("still accepts a well-formed --year 2024 value and produces the real report (no regression)", async () => {
    const fixturePath = makeTmpFixture();
    const result = await runCalcCapture([fixturePath], {
      year: "2024",
      offline: true,
      json: true,
    });

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout) as {
      taxYear: number;
      netResult: number;
      lots: unknown[];
    };
    expect(report.taxYear).toBe(2024);
    // Real gain: (180 - 150) * 10 - 2 - 2 = 296 EUR.
    expect(report.netResult).toBeCloseTo(296, 2);
    expect(report.lots.length).toBeGreaterThan(0);
  });
});
