import { describe, it, expect, beforeAll } from "vitest";
import { Writable } from "node:stream";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runCalc } from "../src/cli/commands/calc.js";
import { it as itStrings } from "../src/i18n/it.js";

/**
 * TC-067: calc sidecar auto-discovery
 *
 * When a <name>.classify.json sidecar exists next to the CSV,
 * runCalc() must load it automatically and produce two-bucket output:
 *   - lot table contains a "BUCKET" column
 *   - stdout contains "BUCKET A" and "BUCKET B" section headers
 *   - exit 0
 *
 * Fixture: etf-trades.csv (IE00B4L5Y983, buy 10@100 EUR, sell 10@150 EUR)
 * Sidecar: etf-trades.classify.json (ETF → bucketGain: "A", taxRate: 0.26)
 *
 * Expected:
 *   gainLossEUR = (1500 - 1) - (1000 + 1) = 498.00 → Bucket A
 *   imposta Bucket A = 498 * 0.26 = 129.48 EUR
 *   Bucket B: all zeros (no B lots)
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures/etf-trades.csv");

let exitCode: number;
let stdoutOutput: string;
let stderrOutput: string;

describe("TC-067: sidecar auto-discovery — two-bucket output", () => {
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

  it("produces no stderr output", () => {
    expect(stderrOutput).toBe("");
  });

  it('stdout contains "BUCKET" column header', () => {
    expect(stdoutOutput).toContain("BUCKET");
  });

  it('stdout contains "BUCKET A" section header', () => {
    expect(stdoutOutput).toContain("BUCKET A");
  });

  it('stdout contains "BUCKET B" section header', () => {
    expect(stdoutOutput).toContain("BUCKET B");
  });

  it("Bucket A section shows the gain amount (498,00)", () => {
    expect(stdoutOutput).toContain("498,00");
  });

  it("Bucket A section shows imposta (129,48)", () => {
    expect(stdoutOutput).toContain("129,48");
  });

  it("lot row shows bucket assignment A", () => {
    // The lot row should include "A" in the BUCKET column
    expect(stdoutOutput).toMatch(/IE00B4L5Y983.*A/);
  });
});
