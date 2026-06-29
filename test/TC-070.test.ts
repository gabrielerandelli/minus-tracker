import { describe, it, expect, beforeAll } from "vitest";
import { Writable } from "node:stream";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runCalc } from "../src/cli/commands/calc.js";
import { it as itStrings } from "../src/i18n/it.js";

/**
 * TC-070: mixed-asset warning (no sidecar)
 *
 * When a CSV contains both IE-prefixed ISINs (ETFs) and non-IE ISINs (Stocks)
 * but no sidecar is present, the Calculator emits a warnMixedAssets warning.
 * The renderer must print it prominently BEFORE the lot table.
 *
 * Fixture: mixed-trades.csv (IE00B4L5Y983 + US0378331005, no sidecar)
 *
 * Expected:
 *   - exit 0
 *   - stdout contains "AVVISO:" warning text before the lot table
 *   - stdout does NOT contain "BUCKET A" or "BUCKET B" section headers
 *   - no bucketA/bucketB in the text output
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures/mixed-trades.csv");

let exitCode: number;
let stdoutOutput: string;
let stderrOutput: string;

describe("TC-070: mixed-asset warning without sidecar", () => {
  beforeAll(async () => {
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
      {},
      itStrings,
      mockStdout,
      mockStderr,
    );
  });

  it("exits with code 0", () => {
    expect(exitCode).toBe(0);
  });

  it("stdout contains Italian warnMixedAssets warning (AVVISO:)", () => {
    expect(stdoutOutput).toContain("AVVISO:");
  });

  it("the AVVISO warning appears before the ISIN column header", () => {
    const warnPos = stdoutOutput.indexOf("AVVISO:");
    const tablePos = stdoutOutput.indexOf("ISIN");
    expect(warnPos).toBeGreaterThan(-1);
    expect(tablePos).toBeGreaterThan(-1);
    expect(warnPos).toBeLessThan(tablePos);
  });

  it('stdout does NOT contain "BUCKET A" section header', () => {
    expect(stdoutOutput).not.toContain("BUCKET A");
  });

  it('stdout does NOT contain "BUCKET B" section header', () => {
    expect(stdoutOutput).not.toContain("BUCKET B");
  });

  it("stdout contains standard summary PLUSVALENZE", () => {
    expect(stdoutOutput).toContain("PLUSVALENZE:");
  });
});
