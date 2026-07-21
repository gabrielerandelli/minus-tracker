import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Writable } from "node:stream";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runCalc } from "../src/cli/commands/calc.js";
import { it as itStrings } from "../src/i18n/it.js";

/**
 * TC-029: calc --json produces machine-readable JSON
 *
 * Invokes runCalc() with { json: true } against a private temp copy of
 * valid-trades.csv (isolated so calc's auto-classify sidecar write doesn't
 * land in the committed test/fixtures/ directory):
 *   BUY  10 shares Apple @ 150 EUR, fees=2.00 EUR (2024-01-14)
 *   SELL 10 shares Apple @ 180 EUR, fees=2.00 EUR (2024-03-15)
 *
 * LIFO result:
 *   buyCostEUR      = 10×150 + 2 = 1502.00
 *   sellProceedsEUR = 10×180 − 2 = 1798.00
 *   gainLossEUR     = 1798 − 1502 = 296.00
 *
 * The --json flag must produce raw JSON on stdout (no Italian table headers,
 * no separator lines, no locale-formatted numbers).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceFixture = path.join(__dirname, "fixtures/valid-trades.csv");

let tmpDir: string;
let fixturePath: string;
let exitCode: number;
let stdoutOutput: string;
let stderrOutput: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let report: any;

describe("TC-029: calc --json produces machine-readable JSON", () => {
  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tc029-"));
    fixturePath = path.join(tmpDir, "valid-trades.csv");
    fs.copyFileSync(sourceFixture, fixturePath);

    stdoutOutput = "";
    stderrOutput = "";

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

    exitCode = await runCalc(
      [fixturePath],
      { json: true },
      itStrings,
      mockStdout,
      mockStderr,
    );

    report = JSON.parse(stdoutOutput);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exits with code 0", () => {
    expect(exitCode).toBe(0);
  });

  it("stderr contains the auto-classify-offline notice (no TTY, no sidecar)", () => {
    expect(stderrOutput).toContain(itStrings.autoClassifyOfflineNotice);
  });

  it("--json mode keeps classify's status lines off stdout (stderr instead)", () => {
    expect(stderrOutput).toContain(itStrings.classifyOfflineWarning);
    expect(stdoutOutput).not.toContain(itStrings.classifyOfflineWarning);
  });

  it("stdout is valid JSON (does not throw)", () => {
    expect(() => JSON.parse(stdoutOutput)).not.toThrow();
  });

  it("report.method is a string", () => {
    expect(typeof report.method).toBe("string");
  });

  it("report.plusvalenze is a number", () => {
    expect(typeof report.plusvalenze).toBe("number");
  });

  it("report.minusvalenze is a number", () => {
    expect(typeof report.minusvalenze).toBe("number");
  });

  it("report.netResult is a number", () => {
    expect(typeof report.netResult).toBe("number");
  });

  it("report.lots is an array", () => {
    expect(Array.isArray(report.lots)).toBe(true);
  });

  it("report.ratesUsed is a non-null object", () => {
    expect(typeof report.ratesUsed).toBe("object");
    expect(report.ratesUsed).not.toBeNull();
  });

  it("report.warnings is an array", () => {
    expect(Array.isArray(report.warnings)).toBe(true);
  });

  it("report.generatedAt matches ISO 8601 format", () => {
    expect(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(report.generatedAt),
    ).toBe(true);
  });

  it('stdout does NOT contain "DATA ACQUISTO" (no Italian table headers in JSON output)', () => {
    expect(stdoutOutput).not.toContain("DATA ACQUISTO");
  });

  it('stdout does NOT contain "─" (no table separator lines in JSON output)', () => {
    expect(stdoutOutput).not.toContain("─");
  });
});
