import { describe, it, expect, beforeAll } from "vitest";
import { Writable } from "node:stream";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runCalc } from "../src/cli/commands/calc.js";
import { it as itStrings } from "../src/i18n/it.js";

/**
 * TC-069: calc --json with sidecar → JSON output includes bucket fields
 *
 * Fixture: etf-trades.csv + etf-trades.classify.json (ETF → Bucket A)
 * Flags: { json: true }
 *
 * Expected JSON shape:
 *   report.plusvalenze          (number)
 *   report.bucketA.groups[]     (array with ≥1 entry)
 *   report.bucketA.totalImposta (number, 129.48)
 *   report.bucketB.plusvalenze  (number, 0)
 *   report.bucketB.minusvalenze (number, 0)
 *   report.bucketB.netResult    (number, 0)
 *   report.lots[0].bucket       ("A")
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures/etf-trades.csv");

let exitCode: number;
let stderrOutput: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let report: any;

describe("TC-069: calc --json with sidecar includes bucketA/bucketB fields", () => {
  beforeAll(async () => {
    let rawJson = "";
    stderrOutput = "";

    const mockStdout = new Writable({
      write(chunk, _, cb) {
        rawJson += chunk.toString();
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

    report = JSON.parse(rawJson);
  });

  it("exits with code 0", () => {
    expect(exitCode).toBe(0);
  });

  it("produces no stderr output", () => {
    expect(stderrOutput).toBe("");
  });

  it("stdout is valid JSON", () => {
    expect(report).toBeDefined();
  });

  it("report.plusvalenze is a number", () => {
    expect(typeof report.plusvalenze).toBe("number");
  });

  it("report.bucketA exists", () => {
    expect(report.bucketA).toBeDefined();
  });

  it("report.bucketA.groups is a non-empty array", () => {
    expect(Array.isArray(report.bucketA.groups)).toBe(true);
    expect(report.bucketA.groups.length).toBeGreaterThan(0);
  });

  it("report.bucketA.totalImposta equals 129.48", () => {
    expect(report.bucketA.totalImposta).toBe(129.48);
  });

  it("report.bucketB exists", () => {
    expect(report.bucketB).toBeDefined();
  });

  it("report.bucketB.plusvalenze is 0 (no Bucket B gains)", () => {
    expect(report.bucketB.plusvalenze).toBe(0);
  });

  it("report.bucketB.minusvalenze is 0", () => {
    expect(report.bucketB.minusvalenze).toBe(0);
  });

  it("report.bucketB.netResult is 0", () => {
    expect(report.bucketB.netResult).toBe(0);
  });

  it('report.lots[0].bucket is "A"', () => {
    expect(report.lots[0].bucket).toBe("A");
  });
});
