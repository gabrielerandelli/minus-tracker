import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { runCalc } from "../src/cli/commands/calc.js";
import { it as itStrings } from "../src/i18n/it.js";

/**
 * Task 63 acceptance test — written but NOT executed, per explicit instruction
 * (2026-09-05 spec-pipeline-execute run for spec-plan/b2373c7). See
 * docs/new-workflow-problems.md in minus-tracker-dev for why: the workflow's own
 * verify pass flagged Task 63 because these TCs had no test file anywhere in the
 * tree, not because the implementation is wrong. Before trusting this file, run
 * it — it has never been executed and may need adjustment.
 *
 * TC-230: All commands' hard-error output is colored red.
 *
 * docs/test_plan/24-cli-color-output.md's own Test Data lists one triggering
 * case per error family: an invalid CSV (errorInvalidCsv), an ambiguous
 * multi-year calc (errorAmbiguousTaxYear), a duplicate-path multi-file calc
 * (errorDuplicateFilePath), an undetectable-broker file
 * (errorBrokerDetectionFailed). All four are reachable through `calc` alone
 * (src/cli/commands/calc.ts's own try/catch around parseMultipleFiles(),
 * which every N=1/N>1 invocation goes through), so this file drives all four
 * through `runCalc` directly rather than one command per case.
 */

const RED_ESCAPE = "\x1b[38;2;248;113;113m"; // #F87171, matches every other *-color.test.ts file

const DEGIRO_HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";
const STOCK_ISIN = "US0378331005";

function degiroBuy(date: string, orderId: string): string {
  return `${date},09:00,Apple Inc,${STOCK_ISIN},XNAS,XNAS,10,100.00,-1000.00,EUR,-1000.00,EUR,1,0.00,EUR,-1000.00,EUR,${orderId}`;
}
function degiroSell(date: string, orderId: string): string {
  return `${date},15:00,Apple Inc,${STOCK_ISIN},XNAS,XNAS,-10,150.00,1500.00,EUR,1500.00,EUR,1,0.00,EUR,1500.00,EUR,${orderId}`;
}
function stockSidecar(): string {
  return JSON.stringify({
    version: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    classifications: {
      [STOCK_ISIN]: {
        product: "Apple Inc",
        assetClass: "Stock",
        bucketGain: "B",
        bucketLoss: "B",
        taxRate: 0,
        whiteListed: null,
        confirmedByUser: true,
        source: "user",
      },
    },
  });
}

// Same unrecognized-format fixture test/broker-detection.test.ts's TC-161 uses.
const UNRELATED_CSV = "Name,Age,City\n1,2,3\n";

interface CaptureResult {
  exitCode: number;
  stderr: string;
}

async function runCalcCapture(
  args: string[],
  flags: Record<string, string | boolean>,
): Promise<CaptureResult> {
  let stderrBuf = "";
  const mockStdout = new Writable({
    write(_chunk, _enc, cb) {
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
    itStrings,
    mockStdout,
    mockStderr,
    true, // color forced on for every case below
  );
  return { exitCode, stderr: stderrBuf };
}

let tmpDirs: string[] = [];
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tc230-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

describe("TC-230: every calc hard-error family renders red", () => {
  it("errorInvalidCsv (malformed CSV content)", async () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, "garbage.csv");
    fs.writeFileSync(filePath, "NOT_A_CSV\x00\x01\x02\ngarbage data");

    const result = await runCalcCapture([filePath], {});
    expect(result.exitCode).toBe(1);
    expect(result.stderr.startsWith(RED_ESCAPE)).toBe(true);
  });

  it("errorAmbiguousTaxYear (SELLs spanning 2 tax years, no --year)", async () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, "mixed.csv");
    fs.writeFileSync(
      filePath,
      [
        DEGIRO_HEADER,
        degiroBuy("10-01-2022", "buy-1"),
        degiroSell("20-06-2023", "sell-1"),
        degiroBuy("10-01-2022", "buy-2"),
        degiroSell("20-06-2024", "sell-2"),
      ].join("\n"),
    );
    fs.writeFileSync(filePath.replace(/\.csv$/, ".classify.json"), stockSidecar());

    const result = await runCalcCapture([filePath], {});
    expect(result.exitCode).toBe(1);
    expect(result.stderr.startsWith(RED_ESCAPE)).toBe(true);
  });

  it("errorDuplicateFilePath (same resolved path given twice)", async () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, "a.csv");
    fs.writeFileSync(
      filePath,
      [DEGIRO_HEADER, degiroBuy("10-01-2022", "buy-1")].join("\n"),
    );

    const result = await runCalcCapture([filePath, filePath], {});
    expect(result.exitCode).toBe(2);
    expect(result.stderr.startsWith(RED_ESCAPE)).toBe(true);
  });

  it("errorBrokerDetectionFailed (neither DEGIRO nor IBKR signature matches)", async () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, "unrelated.csv");
    fs.writeFileSync(filePath, UNRELATED_CSV);

    const result = await runCalcCapture([filePath], {});
    expect(result.exitCode).toBe(2);
    expect(result.stderr.startsWith(RED_ESCAPE)).toBe(true);
  });
});
