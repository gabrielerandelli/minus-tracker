import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Writable } from "node:stream";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { runCalc } from "../src/cli/commands/calc.js";
import { it as itStrings } from "../src/i18n/it.js";

/**
 * TC-072: --carry-forward flag wins over carryforward.json config file
 *
 * Fixture: tc072-trades.csv (Apple, buy 100@100 EUR -1 fee, sell 100@200 EUR -1 fee)
 *   gainLossEUR = (20000 - 1) - (10000 + 1) = 9998.00 → all Bucket B
 * Sidecar: tc072-trades.classify.json (US0378331005 → Stock → bucketGain: "B")
 *
 * carryforward.json contains:
 *   { losses: [{ year: 2023, amount: 2500 }, { year: 2022, amount: 800 }] }
 *
 * --carry-forward "2023:5000" overrides the 2023 entry → flag wins.
 *
 * Merged carry-forwards (sorted by year):
 *   2022: 800  (from config file)
 *   2023: 5000 (flag overrides 2500)
 *
 * Calculator applies oldest-first (taxYear=2024, both within 4 years):
 *   2022: consumed = min(800, 9998) = 800; remaining = 9198
 *   2023: consumed = min(5000, 9198) = 5000; remaining = 4198
 *   carryForwardApplied = 5800
 *   netResult = 9998 - 5800 = 4198
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures/tc072-trades.csv");

let exitCode: number;
let stderrOutput: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let report: any;
let tmpDir: string;
const prevXdgConfigHome = process.env["XDG_CONFIG_HOME"];

describe("TC-072: carry-forward flag wins over config file", () => {
  beforeAll(async () => {
    // Create a temporary XDG_CONFIG_HOME with a carryforward.json
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tc072-"));
    const cfDir = path.join(tmpDir, "minus-tracker");
    fs.mkdirSync(cfDir, { recursive: true });
    fs.writeFileSync(
      path.join(cfDir, "carryforward.json"),
      JSON.stringify({
        losses: [
          { year: 2023, amount: 2500 },
          { year: 2022, amount: 800 },
        ],
      }),
    );

    // Point XDG_CONFIG_HOME to our temp dir
    process.env["XDG_CONFIG_HOME"] = tmpDir;

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
      { json: true, "carry-forward": "2023:5000" },
      itStrings,
      mockStdout,
      mockStderr,
    );

    report = JSON.parse(rawJson);
  });

  afterAll(() => {
    // Restore XDG_CONFIG_HOME
    if (prevXdgConfigHome === undefined) {
      delete process.env["XDG_CONFIG_HOME"];
    } else {
      process.env["XDG_CONFIG_HOME"] = prevXdgConfigHome;
    }
    // Clean up temp dir
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("exits with code 0", () => {
    expect(exitCode).toBe(0);
  });

  it("produces no stderr output", () => {
    expect(stderrOutput).toBe("");
  });

  it("report.bucketB exists", () => {
    expect(report.bucketB).toBeDefined();
  });

  it("report.bucketB.plusvalenze is 9998 (all lots are Bucket B)", () => {
    expect(report.bucketB.plusvalenze).toBe(9998);
  });

  it("report.bucketB.carryForwardApplied is 5800 (800 from 2022 + 5000 from 2023)", () => {
    expect(report.bucketB.carryForwardApplied).toBe(5800);
  });

  it("report.bucketB.netResult is 4198 (9998 - 5800)", () => {
    expect(report.bucketB.netResult).toBe(4198);
  });

  it("report.bucketA is undefined (no Bucket A gains)", () => {
    expect(report.bucketA).toBeUndefined();
  });

  it('report.lots[0].bucket is "B"', () => {
    expect(report.lots[0].bucket).toBe("B");
  });
});
