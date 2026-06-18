import { describe, it, expect, beforeAll } from "vitest";
import { Writable } from "node:stream";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runCalc } from "../src/cli/commands/calc.js";
import { it as itStrings } from "../src/i18n/it.js";

/**
 * TC-028: calc --method FIFO selects FIFO lot matching
 *
 * Invokes runCalc() directly with mock streams against ae-03.csv:
 *   BUY 1: 10 shares @ 100.00 EUR, fees=2.00 EUR (2024-01-02)
 *   BUY 2: 10 shares @ 120.00 EUR, fees=2.00 EUR (2024-03-01)
 *   SELL:  10 shares @ 130.00 EUR, fees=2.00 EUR (2024-06-03)
 *
 * FIFO result (matches BUY 1 — oldest lot):
 *   buyCostEUR      = 10×100 + 2 = 1002.00
 *   sellProceedsEUR = 10×130 − 2 = 1298.00
 *   gainLossEUR     = 1298 − 1002 = 296.00
 *
 * LIFO result (matches BUY 2 — most recent lot):
 *   buyCostEUR      = 10×120 + 2 = 1202.00
 *   sellProceedsEUR = 10×130 − 2 = 1298.00
 *   gainLossEUR     = 1298 − 1202 = 96.00
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures/ae/ae-03.csv");

// ── FIFO run ────────────────────────────────────────────────────────────────

let fifoExitCode: number;
let fifoStdout: string;
let fifoStderr: string;

describe("TC-028 (FIFO): calc --method FIFO selects FIFO lot matching", () => {
  beforeAll(async () => {
    fifoStdout = "";
    fifoStderr = "";

    const mockStdout = new Writable({
      write(chunk, _, cb) {
        fifoStdout += chunk.toString();
        cb();
      },
    });

    const mockStderr = new Writable({
      write(chunk, _, cb) {
        fifoStderr += chunk.toString();
        cb();
      },
    });

    fifoExitCode = await runCalc(
      [fixturePath],
      { method: "FIFO" },
      itStrings,
      mockStdout,
      mockStderr,
    );
  });

  it("exits with code 0", () => {
    expect(fifoExitCode).toBe(0);
  });

  it("produces no stderr output", () => {
    expect(fifoStderr).toBe("");
  });

  it('stdout contains "METODO: FIFO"', () => {
    expect(fifoStdout).toContain("METODO: FIFO");
  });

  it("stdout contains the FIFO gain (296,00 — Italian locale)", () => {
    expect(fifoStdout).toContain("296,00");
  });

  it('stdout does NOT contain "+96,00" (the LIFO gain — BUY 2 must not be matched)', () => {
    // +96,00 is the formatted gain/loss column for the LIFO result.
    // "+296,00" does not contain "+96,00" as a substring, so this
    // assertion unambiguously confirms FIFO picked BUY 1 (296), not BUY 2 (96).
    expect(fifoStdout).not.toContain("+96,00");
  });
});

// ── LIFO run (default — no --method flag) ───────────────────────────────────

let lifoExitCode: number;
let lifoStdout: string;
let lifoStderr: string;

describe("TC-028 (LIFO control): default method is LIFO and produces 96,00", () => {
  beforeAll(async () => {
    lifoStdout = "";
    lifoStderr = "";

    const mockStdout = new Writable({
      write(chunk, _, cb) {
        lifoStdout += chunk.toString();
        cb();
      },
    });

    const mockStderr = new Writable({
      write(chunk, _, cb) {
        lifoStderr += chunk.toString();
        cb();
      },
    });

    lifoExitCode = await runCalc(
      [fixturePath],
      {},
      itStrings,
      mockStdout,
      mockStderr,
    );
  });

  it("exits with code 0", () => {
    expect(lifoExitCode).toBe(0);
  });

  it("produces no stderr output", () => {
    expect(lifoStderr).toBe("");
  });

  it('stdout contains "METODO: LIFO"', () => {
    expect(lifoStdout).toContain("METODO: LIFO");
  });

  it("stdout contains the LIFO gain (96,00 — Italian locale)", () => {
    expect(lifoStdout).toContain("96,00");
  });
});
