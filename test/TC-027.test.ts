import { describe, it, expect, beforeAll } from "vitest";
import { Writable } from "node:stream";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runCalc } from "../src/cli/commands/calc.js";
import { it as itStrings } from "../src/i18n/it.js";

/**
 * TC-027: calc default — LIFO table output, Italian locale
 *
 * Invokes runCalc() directly with mock streams against the shared
 * valid-trades.csv fixture (Apple Inc, 1 BUY 10×150 EUR fees=2,
 * 1 SELL 10×180 EUR fees=2).
 *
 * Expected gain:
 *   sellProceedsEUR = 1800 − 2 = 1798
 *   buyCostEUR      = 1500 + 2 = 1502
 *   gainLossEUR     = 1798 − 1502 = 296.00
 *
 * Default method is LIFO (no --method flag supplied).
 * Numbers must be formatted in Italian locale (comma decimal separator).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures/valid-trades.csv");

let exitCode: number;
let stdoutOutput: string;
let stderrOutput: string;

describe("TC-027: calc default — LIFO table output, Italian locale", () => {
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

  it("stderr contains only the no-sidecar soft warning (v0.7.0)", () => {
    expect(stderrOutput).toBe(itStrings.warnNoDichiarazioneSidecar + "\n");
  });

  it('stdout contains "METODO: LIFO"', () => {
    expect(stdoutOutput).toContain("METODO: LIFO");
  });

  it('stdout contains column header "ISIN"', () => {
    expect(stdoutOutput).toContain("ISIN");
  });

  it('stdout contains column header "TITOLO"', () => {
    expect(stdoutOutput).toContain("TITOLO");
  });

  it('stdout contains column header "QTÀ"', () => {
    expect(stdoutOutput).toContain("QTÀ");
  });

  it('stdout contains column header "DATA ACQUISTO"', () => {
    expect(stdoutOutput).toContain("DATA ACQUISTO");
  });

  it('stdout contains column header "DATA VENDITA"', () => {
    expect(stdoutOutput).toContain("DATA VENDITA");
  });

  it('stdout contains summary label "PLUSVALENZE:"', () => {
    expect(stdoutOutput).toContain("PLUSVALENZE:");
  });

  it('stdout contains summary label "MINUSVALENZE:"', () => {
    expect(stdoutOutput).toContain("MINUSVALENZE:");
  });

  it('stdout contains summary label "RISULTATO NETTO:"', () => {
    expect(stdoutOutput).toContain("RISULTATO NETTO:");
  });

  it("stdout contains the disclaimer", () => {
    expect(stdoutOutput).toContain(
      "minus-tracker è un ausilio al calcolo, non consulenza fiscale.",
    );
  });

  it("stdout contains the gain amount (296)", () => {
    expect(stdoutOutput).toContain("296");
  });

  it("EUR amounts use Italian locale — gain appears as 296,00", () => {
    expect(stdoutOutput).toContain("296,00");
  });
});
