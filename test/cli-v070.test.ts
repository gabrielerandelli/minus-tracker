import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { Writable } from "node:stream";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { runCalc } from "../src/cli/commands/calc.js";
import { it as itStrings } from "../src/i18n/it.js";
import { en as enStrings } from "../src/i18n/en.js";

/**
 * Category 17 — CLI: Dichiarazione Output (v0.7.0)
 *
 * Covers TC-094, TC-095, TC-096 from docs/test_plan/13-cli-v070.md.
 */

// Isolate XDG_CONFIG_HOME with a fresh ECB rates snapshot so calc's
// auto-update-on-stale-rates flow never triggers (it would otherwise write
// progress text to stdout ahead of the JSON report, unrelated to this
// suite's assertions).
const prevXdgConfigHome = process.env["XDG_CONFIG_HOME"];
let rateConfigDir: string;

beforeAll(() => {
  rateConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-v070-rates-"));
  const mtDir = path.join(rateConfigDir, "minus-tracker");
  fs.mkdirSync(mtDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(
    path.join(mtDir, "ecb-rates.json"),
    JSON.stringify({ USD: { [today]: 1.08 } }),
  );
  process.env["XDG_CONFIG_HOME"] = rateConfigDir;
});

afterAll(() => {
  if (prevXdgConfigHome === undefined) {
    delete process.env["XDG_CONFIG_HOME"];
  } else {
    process.env["XDG_CONFIG_HOME"] = prevXdgConfigHome;
  }
  fs.rmSync(rateConfigDir, { recursive: true, force: true });
});

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

const STOCK_ISIN = "US0378331005";
const ETF_ISIN = "IE00B4L5Y983";

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

function stockAndEtfSidecar(): string {
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
      [ETF_ISIN]: {
        product: "iShares MSCI World ETF",
        assetClass: "ETF",
        bucketGain: "A",
        bucketLoss: "B",
        taxRate: 0.26,
        whiteListed: null,
        confirmedByUser: true,
        source: "openfigi",
      },
    },
  });
}

interface CaptureResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runCalcCapture(
  args: string[],
  flags: Record<string, string | boolean>,
  s: typeof itStrings,
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
  const exitCode = await runCalc(args, flags, s, mockStdout, mockStderr);
  return { exitCode, stdout: stdoutBuf, stderr: stderrBuf };
}

let tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-v070-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

// ---------------------------------------------------------------------------
// TC-094 (TC-D10): Missing sidecar — calc auto-classifies, declaration present
//
// Historically this covered "no sidecar → declaration section absent, soft
// warning". Since calc now auto-classifies when no sidecar exists, that
// scenario no longer occurs via the CLI: a classification (offline, since
// there's no TTY in tests) is always produced, so the declaration section is
// now always present. Updated to assert the new default behavior.
// ---------------------------------------------------------------------------

describe("TC-094: missing sidecar — calc auto-classifies, declaration section present", () => {
  function writeCsv(dir: string): string {
    const csvPath = path.join(dir, "trades.csv");
    const rows = [
      HEADER,
      `10-01-2024,09:00,Apple Inc,${STOCK_ISIN},XNAS,XNAS,10,100.00,-1000.00,EUR,-1000.00,EUR,1,0.00,EUR,-1000.00,EUR,buy-1`,
      `20-06-2024,15:00,Apple Inc,${STOCK_ISIN},XNAS,XNAS,-10,150.00,1500.00,EUR,1500.00,EUR,1,0.00,EUR,1500.00,EUR,sell-1`,
    ];
    fs.writeFileSync(csvPath, rows.join("\n"));
    return csvPath;
  }

  it("Step 1+2: stdout has the MODELLO REDDITI PF section; stderr has the auto-classify notice", async () => {
    const dir = makeTmpDir();
    const csvPath = writeCsv(dir);

    const result = await runCalcCapture([csvPath], {}, itStrings);

    expect(result.stdout).toContain("MODELLO REDDITI PF");
    expect(result.stderr).toContain(itStrings.autoClassifyOfflineNotice);
  });

  it("Step 3: Italian locale text matches the classify-first suggestion", async () => {
    const dir = makeTmpDir();
    const csvPath = writeCsv(dir);

    const result = await runCalcCapture([csvPath], {}, itStrings);

    expect(itStrings.autoClassifyOfflineNotice).toContain(
      "minus-tracker classify",
    );
    expect(result.stderr).toContain(itStrings.autoClassifyOfflineNotice);
  });

  it("Step 4: exit code is 0", async () => {
    const dir = makeTmpDir();
    const csvPath = writeCsv(dir);

    const result = await runCalcCapture([csvPath], {}, itStrings);

    expect(result.exitCode).toBe(0);
  });

  it("Step 5: --lang en equivalent — English notice shown, declaration section present", async () => {
    const dir = makeTmpDir();
    const csvPath = writeCsv(dir);

    const result = await runCalcCapture([csvPath], {}, enStrings);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("MODELLO REDDITI PF");
    expect(result.stderr).toContain(enStrings.autoClassifyOfflineNotice);
  });

  it("writes a .classify.json sidecar next to the CSV", async () => {
    const dir = makeTmpDir();
    const csvPath = writeCsv(dir);

    await runCalcCapture([csvPath], {}, itStrings);

    expect(fs.existsSync(path.join(dir, "trades.classify.json"))).toBe(true);
  });

  it("--offline forces offline mode without printing the no-TTY notice", async () => {
    const dir = makeTmpDir();
    const csvPath = writeCsv(dir);

    const result = await runCalcCapture(
      [csvPath],
      { offline: true },
      itStrings,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain(itStrings.autoClassifyOfflineNotice);
    expect(result.stdout).toContain(itStrings.classifyOfflineWarning);
    expect(result.stdout).toContain("MODELLO REDDITI PF");
  });
});

// ---------------------------------------------------------------------------
// TC-095 (TC-D12): --export-dichiarazione writes valid JSON
// ---------------------------------------------------------------------------

describe("TC-095: --export-dichiarazione writes valid JSON with all required fields", () => {
  function writeFixtures(dir: string): string {
    const csvPath = path.join(dir, "trades.csv");
    const sidecarPath = path.join(dir, "trades.classify.json");
    const rows = [
      HEADER,
      // Stock (Bucket B): buy 10@100, sell 10@150 → gain 500
      `10-01-2024,09:00,Apple Inc,${STOCK_ISIN},XNAS,XNAS,10,100.00,-1000.00,EUR,-1000.00,EUR,1,0.00,EUR,-1000.00,EUR,buy-1`,
      `20-06-2024,15:00,Apple Inc,${STOCK_ISIN},XNAS,XNAS,-10,150.00,1500.00,EUR,1500.00,EUR,1,0.00,EUR,1500.00,EUR,sell-1`,
      // ETF (Bucket A, 26%): buy 10@100, sell 10@120 → gain 200
      `05-02-2024,09:00,iShares MSCI World ETF,${ETF_ISIN},XETRA,XETRA,10,100.00,-1000.00,EUR,-1000.00,EUR,1,0.00,EUR,-1000.00,EUR,buy-2`,
      `15-07-2024,15:00,iShares MSCI World ETF,${ETF_ISIN},XETRA,XETRA,-10,120.00,1200.00,EUR,1200.00,EUR,1,0.00,EUR,1200.00,EUR,sell-2`,
      // Dividend row on the stock ISIN
      `01-08-2024,00:00,DIVIDEND Apple Inc,${STOCK_ISIN},,,0,,50.00,EUR,50.00,EUR,1,0.00,EUR,50.00,EUR,`,
    ];
    fs.writeFileSync(csvPath, rows.join("\n"));
    fs.writeFileSync(sidecarPath, stockAndEtfSidecar());
    return csvPath;
  }

  it("Steps 1-9: exports valid dichiarazione JSON with correct fields", async () => {
    const dir = makeTmpDir();
    const csvPath = writeFixtures(dir);

    const result = await runCalcCapture(
      [csvPath],
      { "export-dichiarazione": true, "carry-forward": "2023:500" },
      itStrings,
    );

    // Step 1: exit code 0
    expect(result.exitCode).toBe(0);

    // Step 2: default export path exists
    const exportPath = path.join(dir, "trades.dichiarazione.json");
    expect(fs.existsSync(exportPath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(exportPath, "utf-8"));

    // Step 3: version
    expect(parsed.version).toBe(1);
    // Step 4: modello
    expect(parsed.modello).toBe("Redditi PF");
    // Step 5: generatedAt is valid ISO-8601
    expect(new Date(parsed.generatedAt).toISOString()).toBe(parsed.generatedAt);
    // Step 6: quadroRT numeric values
    expect(parsed.quadroRT.plusvalenze).toBe(500);
    expect(parsed.quadroRT.minusvalenze).toBe(0);
    expect(parsed.quadroRT.differenza).toBe(500);
    // Step 7: carryForwardApplied
    expect(parsed.quadroRT.carryForwardApplied).toEqual([
      { annoOrigine: 2023, importo: 500 },
    ]);
    // Step 8: capitaleAliquota26
    expect(parsed.quadroRM.capitaleAliquota26).toEqual({
      plusvalenze: 200,
      imposta: 52,
    });
    // Step 9: dividendiEsteri has at least one entry
    expect(parsed.quadroRM.dividendiEsteri.length).toBeGreaterThanOrEqual(1);
    expect(parsed.quadroRM.dividendiEsteri[0]).toMatchObject({
      isin: STOCK_ISIN,
      lordo: 50,
    });
  });

  it("Step 10: --json without --export-dichiarazione — 'dichiarazione' key absent", async () => {
    const dir = makeTmpDir();
    const csvPath = writeFixtures(dir);

    const result = await runCalcCapture([csvPath], { json: true }, itStrings);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(Object.prototype.hasOwnProperty.call(parsed, "dichiarazione")).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// TC-096 (TC-D20): differenza > 0 with no --carry-forward → warning note
// ---------------------------------------------------------------------------

describe("TC-096: warnNoCarryForwardProvided note appears only when differenza > 0 and no CF given", () => {
  function writeGainFixtures(dir: string): string {
    const csvPath = path.join(dir, "trades.csv");
    const sidecarPath = path.join(dir, "trades.classify.json");
    const rows = [
      HEADER,
      // Bucket B gain of 500
      `10-01-2024,09:00,Apple Inc,${STOCK_ISIN},XNAS,XNAS,10,100.00,-1000.00,EUR,-1000.00,EUR,1,0.00,EUR,-1000.00,EUR,buy-1`,
      `20-06-2024,15:00,Apple Inc,${STOCK_ISIN},XNAS,XNAS,-10,150.00,1500.00,EUR,1500.00,EUR,1,0.00,EUR,1500.00,EUR,sell-1`,
    ];
    fs.writeFileSync(csvPath, rows.join("\n"));
    fs.writeFileSync(sidecarPath, stockSidecar());
    return csvPath;
  }

  function writeLossFixtures(dir: string): string {
    const csvPath = path.join(dir, "trades.csv");
    const sidecarPath = path.join(dir, "trades.classify.json");
    const rows = [
      HEADER,
      // Bucket B loss of 500
      `10-01-2024,09:00,Apple Inc,${STOCK_ISIN},XNAS,XNAS,10,150.00,-1500.00,EUR,-1500.00,EUR,1,0.00,EUR,-1500.00,EUR,buy-1`,
      `20-06-2024,15:00,Apple Inc,${STOCK_ISIN},XNAS,XNAS,-10,100.00,1000.00,EUR,1000.00,EUR,1,0.00,EUR,1000.00,EUR,sell-1`,
    ];
    fs.writeFileSync(csvPath, rows.join("\n"));
    fs.writeFileSync(sidecarPath, stockSidecar());
    return csvPath;
  }

  it("Step 1: no --carry-forward, differenza > 0 → note shown on RT-N line", async () => {
    const dir = makeTmpDir();
    const csvPath = writeGainFixtures(dir);

    const result = await runCalcCapture([csvPath], {}, itStrings);

    expect(result.exitCode).toBe(0);
    const rtNLine = result.stdout
      .split("\n")
      .find((line) => line.includes(itStrings.quadroRTImponibile));
    expect(rtNLine).toBeDefined();
    expect(rtNLine).toContain(itStrings.warnNoCarryForwardProvided);
  });

  it("Step 2: --carry-forward provided → note NOT shown", async () => {
    const dir = makeTmpDir();
    const csvPath = writeGainFixtures(dir);

    const result = await runCalcCapture(
      [csvPath],
      { "carry-forward": "2023:100" },
      itStrings,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain(itStrings.warnNoCarryForwardProvided);
  });

  it("Step 3: differenza <= 0 → note NOT shown", async () => {
    const dir = makeTmpDir();
    const csvPath = writeLossFixtures(dir);

    const result = await runCalcCapture([csvPath], {}, itStrings);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain(itStrings.warnNoCarryForwardProvided);
  });
});
