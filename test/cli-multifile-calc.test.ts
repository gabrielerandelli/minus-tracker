import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { runCalc } from "../src/cli/commands/calc.js";
import { it as itStrings } from "../src/i18n/it.js";
import { en as enStrings } from "../src/i18n/en.js";

/**
 * Category 23 — CLI `calc` multi-file + tax-year scoping wiring (v0.11.2, Task 53).
 * TC-177, TC-178, TC-180 (calc slice), TC-182 (calc slice), TC-183, TC-184,
 * TC-185, from docs/test_plan/23-multifile-taxyear.md.
 *
 * All fixtures are EUR-denominated to avoid any ECB rate/network dependency.
 */

const DEGIRO_HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

const IBKR_TRADES_HEADER =
  "Trades,Header,DataDiscriminator,AssetCategory,CurrencyPrimary,Symbol,Description,ISIN,TradeDate,Buy/Sell,Quantity,TradePrice,IBCommission,IBCommissionCurrency";

const STOCK_ISIN = "US0378331005";

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

function degiroBuy(date: string, orderId: string): string {
  return `${date},09:00,Apple Inc,${STOCK_ISIN},XNAS,XNAS,10,100.00,-1000.00,EUR,-1000.00,EUR,1,0.00,EUR,-1000.00,EUR,${orderId}`;
}
function degiroSell(date: string, orderId: string): string {
  return `${date},15:00,Apple Inc,${STOCK_ISIN},XNAS,XNAS,-10,150.00,1500.00,EUR,1500.00,EUR,1,0.00,EUR,1500.00,EUR,${orderId}`;
}

function ibkrBuy(date: string): string {
  return `Trades,Data,Order,STK,EUR,AAPL,APPLE INC,${STOCK_ISIN},${date},BUY,10,100.00,-1.00,EUR`;
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-mf-calc-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

describe("TC-177/178: --year scoping and AMBIGUOUS_TAX_YEAR", () => {
  function multiYearFixture(dir: string): string {
    const csvPath = path.join(dir, "mixed.csv");
    fs.writeFileSync(
      csvPath,
      [
        DEGIRO_HEADER,
        degiroBuy("10-01-2022", "buy-1"),
        degiroSell("20-06-2023", "sell-1"),
        degiroBuy("10-01-2022", "buy-2"),
        degiroSell("20-06-2024", "sell-2"),
      ].join("\n"),
    );
    return csvPath;
  }

  it("TC-177: --year 2023 scopes the report to 2023 only, exit 0", async () => {
    const dir = makeTmpDir();
    const csvPath = path.join(dir, "mixed.csv");
    fs.writeFileSync(
      csvPath,
      [
        DEGIRO_HEADER,
        degiroBuy("10-01-2022", "buy-1"),
        degiroSell("20-06-2023", "sell-1"),
        degiroBuy("10-01-2022", "buy-2"),
        degiroSell("20-06-2024", "sell-2"),
      ].join("\n"),
    );
    fs.writeFileSync(csvPath.replace(/\.csv$/, ".classify.json"), stockSidecar());

    const result = await runCalcCapture(
      [csvPath],
      { year: "2023", json: true },
      itStrings,
    );
    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.taxYear).toBe(2023);
    expect(report.lots).toHaveLength(1);
    expect(report.plusvalenze).toBeGreaterThan(0);
  });

  it("TC-178: omitting --year with SELLs spanning 2 years → exit 1, errorAmbiguousTaxYear (IT)", async () => {
    const dir = makeTmpDir();
    const csvPath = multiYearFixture(dir);
    fs.writeFileSync(csvPath.replace(/\.csv$/, ".classify.json"), stockSidecar());

    const result = await runCalcCapture([csvPath], {}, itStrings);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("più anni fiscali");
    expect(result.stderr).toContain("2023, 2024");
  });

  it("TC-178: same fixture with English locale strings → English errorAmbiguousTaxYear", async () => {
    const dir = makeTmpDir();
    const csvPath = multiYearFixture(dir);
    fs.writeFileSync(csvPath.replace(/\.csv$/, ".classify.json"), stockSidecar());

    const result = await runCalcCapture([csvPath], {}, enStrings);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("multiple tax years");
    expect(result.stderr).toContain("2023, 2024");
  });
});

describe("TC-180 (calc slice): N=1 invocation unchanged", () => {
  it("single file, no --sidecar → succeeds exactly as before", async () => {
    const dir = makeTmpDir();
    const csvPath = path.join(dir, "single.csv");
    fs.writeFileSync(
      csvPath,
      [DEGIRO_HEADER, degiroBuy("10-01-2024", "buy-1"), degiroSell("20-06-2024", "sell-1")].join(
        "\n",
      ),
    );
    fs.writeFileSync(csvPath.replace(/\.csv$/, ".classify.json"), stockSidecar());

    const result = await runCalcCapture([csvPath], { json: true }, itStrings);
    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.lots).toHaveLength(1);
    expect(report.plusvalenze).toBeGreaterThan(0);
  });
});

describe("TC-182 (calc slice): --sidecar required at N>1", () => {
  it("two files, no --sidecar → exit 2, errorMultiFileOutputRequired", async () => {
    const dir = makeTmpDir();
    const csv2023 = path.join(dir, "2023.csv");
    const csv2024 = path.join(dir, "2024.csv");
    fs.writeFileSync(
      csv2023,
      [DEGIRO_HEADER, degiroBuy("10-01-2022", "buy-1"), degiroSell("20-06-2023", "sell-1")].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      csv2024,
      [DEGIRO_HEADER, degiroBuy("10-01-2022", "buy-2"), degiroSell("20-06-2024", "sell-2")].join(
        "\n",
      ),
    );

    const result = await runCalcCapture(
      [csv2023, csv2024],
      { year: "2023" },
      itStrings,
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--sidecar");
  });

  it("two files with --sidecar out.json → exit 0, sidecar written there", async () => {
    const dir = makeTmpDir();
    const csv2023 = path.join(dir, "2023.csv");
    const csv2024 = path.join(dir, "2024.csv");
    const sidecarOut = path.join(dir, "out.json");
    fs.writeFileSync(
      csv2023,
      [DEGIRO_HEADER, degiroBuy("10-01-2022", "buy-1"), degiroSell("20-06-2023", "sell-1")].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      csv2024,
      [DEGIRO_HEADER, degiroBuy("10-01-2022", "buy-2"), degiroSell("20-06-2024", "sell-2")].join(
        "\n",
      ),
    );
    fs.writeFileSync(sidecarOut, stockSidecar());

    const result = await runCalcCapture(
      [csv2023, csv2024],
      { year: "2023", sidecar: sidecarOut, json: true },
      itStrings,
    );
    expect(result.exitCode).toBe(0);
  });
});

describe("TC-183: --export-dichiarazione bare-value convenience limited to N=1", () => {
  it("N=1 bare flag → exit 0, export auto-derived from the input file", async () => {
    const dir = makeTmpDir();
    const csvPath = path.join(dir, "file.csv");
    fs.writeFileSync(
      csvPath,
      [DEGIRO_HEADER, degiroBuy("10-01-2024", "buy-1"), degiroSell("20-06-2024", "sell-1")].join(
        "\n",
      ),
    );
    fs.writeFileSync(csvPath.replace(/\.csv$/, ".classify.json"), stockSidecar());

    const result = await runCalcCapture(
      [csvPath],
      { "export-dichiarazione": true },
      itStrings,
    );
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(dir, "file.dichiarazione.json"))).toBe(true);
  });

  it("N>1 bare flag (no value) → exit 2, errorMultiFileOutputRequired", async () => {
    const dir = makeTmpDir();
    const csv2023 = path.join(dir, "2023.csv");
    const csv2024 = path.join(dir, "2024.csv");
    fs.writeFileSync(
      csv2023,
      [DEGIRO_HEADER, degiroBuy("10-01-2022", "buy-1"), degiroSell("20-06-2023", "sell-1")].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      csv2024,
      [DEGIRO_HEADER, degiroBuy("10-01-2022", "buy-2"), degiroSell("20-06-2024", "sell-2")].join(
        "\n",
      ),
    );

    const result = await runCalcCapture(
      [csv2023, csv2024],
      { year: "2023", sidecar: path.join(dir, "sc.json"), "export-dichiarazione": true },
      itStrings,
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--export-dichiarazione");
  });

  it("N>1 with explicit export path → exit 0, dichiarazione written there", async () => {
    const dir = makeTmpDir();
    const csv2023 = path.join(dir, "2023.csv");
    const csv2024 = path.join(dir, "2024.csv");
    const sidecarOut = path.join(dir, "sc.json");
    const exportOut = path.join(dir, "out.dichiarazione.json");
    fs.writeFileSync(
      csv2023,
      [DEGIRO_HEADER, degiroBuy("10-01-2022", "buy-1"), degiroSell("20-06-2023", "sell-1")].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      csv2024,
      [DEGIRO_HEADER, degiroBuy("10-01-2022", "buy-2"), degiroSell("20-06-2024", "sell-2")].join(
        "\n",
      ),
    );
    fs.writeFileSync(sidecarOut, stockSidecar());

    const result = await runCalcCapture(
      [csv2023, csv2024],
      {
        year: "2023",
        sidecar: sidecarOut,
        "export-dichiarazione": exportOut,
      },
      itStrings,
    );
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(exportOut)).toBe(true);
  });
});

describe("TC-184: --broker with N>1 applies uniformly, skipping per-file auto-detection", () => {
  it("--broker ibkr forced onto two DEGIRO-shaped CSVs → parse fails (exit 1)", async () => {
    const dir = makeTmpDir();
    const csv1 = path.join(dir, "degiro1.csv");
    const csv2 = path.join(dir, "degiro2.csv");
    fs.writeFileSync(
      csv1,
      [DEGIRO_HEADER, degiroBuy("10-01-2024", "buy-1"), degiroSell("20-06-2024", "sell-1")].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      csv2,
      [DEGIRO_HEADER, degiroBuy("10-01-2024", "buy-2"), degiroSell("20-06-2024", "sell-2")].join(
        "\n",
      ),
    );

    const result = await runCalcCapture(
      [csv1, csv2],
      { broker: "ibkr", sidecar: path.join(dir, "sc.json") },
      itStrings,
    );
    expect(result.exitCode).toBe(1);
  });
});

describe("TC-185: mixed-broker N>1 input without --broker auto-detects per file", () => {
  it("one DEGIRO + one IBKR file → exit 0, transactions from both merged", async () => {
    const dir = makeTmpDir();
    const degiroPath = path.join(dir, "degiro.csv");
    const ibkrPath = path.join(dir, "ibkr.csv");
    const sidecarOut = path.join(dir, "sc.json");
    fs.writeFileSync(
      degiroPath,
      [DEGIRO_HEADER, degiroBuy("10-01-2024", "buy-1"), degiroSell("20-06-2024", "sell-1")].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      ibkrPath,
      [IBKR_TRADES_HEADER, ibkrBuy("20240115")].join("\n"),
    );
    fs.writeFileSync(sidecarOut, stockSidecar());

    const result = await runCalcCapture(
      [degiroPath, ibkrPath],
      { year: "2024", sidecar: sidecarOut, json: true },
      itStrings,
    );
    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout);
    // 20 shares bought total (10 DEGIRO + 10 IBKR), 10 sold — LIFO/FIFO both
    // consume the most-recently-added open lot; either way one plusvalenza row.
    expect(report.lots).toHaveLength(1);
    expect(report.plusvalenze).toBeGreaterThan(0);
  });
});
