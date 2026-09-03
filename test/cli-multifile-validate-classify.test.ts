import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { runValidate } from "../src/cli/commands/validate.js";
import { runClassify } from "../src/cli/commands/classify.js";
import { it as itStrings } from "../src/i18n/it.js";

/**
 * Category 23 — CLI `validate`/`classify` multi-file wiring (v0.11.2, Tasks
 * 54/55). TC-180 (validate/classify slices), TC-182 (classify slice),
 * TC-193, TC-194, from docs/test_plan/23-multifile-taxyear.md.
 */

const DEGIRO_HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

const STOCK_ISIN = "US0378331005";
const ETF_ISIN = "IE00B4L5Y983";
const BOND_ISIN = "XS1234567890";

function degiroBuy(isin: string, date: string, orderId: string): string {
  return `${date},09:00,Product ${isin},${isin},XNAS,XNAS,10,100.00,-1000.00,EUR,-1000.00,EUR,1,0.00,EUR,-1000.00,EUR,${orderId}`;
}
function degiroSell(isin: string, date: string, orderId: string): string {
  return `${date},15:00,Product ${isin},${isin},XNAS,XNAS,-10,150.00,1500.00,EUR,1500.00,EUR,1,0.00,EUR,1500.00,EUR,${orderId}`;
}
// A row with an unsupported currency — deliberately skip-worthy, to exercise
// the per-file warning path.
function degiroUnsupportedCurrencyRow(isin: string, date: string, orderId: string): string {
  return `${date},09:00,Product ${isin},${isin},XNAS,XNAS,5,50.00,-250.00,XYZ,-250.00,XYZ,1,0.00,XYZ,-250.00,XYZ,${orderId}`;
}

interface CaptureResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runValidateCapture(
  args: string[],
  flags: Record<string, string | boolean>,
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
  const exitCode = await runValidate(args, flags, itStrings, mockStdout, mockStderr);
  return { exitCode, stdout: stdoutBuf, stderr: stderrBuf };
}

async function runClassifyCapture(
  args: string[],
  flags: Record<string, string | boolean>,
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
  const exitCode = await runClassify(
    args,
    { ...flags, offline: true },
    itStrings,
    mockStdout,
    mockStderr,
  );
  return { exitCode, stdout: stdoutBuf, stderr: stderrBuf };
}

let tmpDirs: string[] = [];
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-mf-vc-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

describe("TC-180 (validate slice): N=1 byte-for-byte unchanged", () => {
  it("single file → same single-block output, no validateTotal line", async () => {
    const dir = makeTmpDir();
    const csvPath = path.join(dir, "file.csv");
    fs.writeFileSync(
      csvPath,
      [DEGIRO_HEADER, degiroBuy(STOCK_ISIN, "10-01-2024", "buy-1")].join("\n"),
    );

    const result = await runValidateCapture([csvPath], {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(itStrings.validateOk(1, 0));
    expect(result.stdout).not.toContain("Totale:");
    expect(result.stdout).not.toContain("[file.csv]");
  });
});

describe("TC-180/TC-182 (classify slice): N=1 unchanged, --sidecar still optional", () => {
  it("single file, no --sidecar → exit 0, sidecar written to <file>.classify.json", async () => {
    const dir = makeTmpDir();
    const csvPath = path.join(dir, "file.csv");
    fs.writeFileSync(
      csvPath,
      [DEGIRO_HEADER, degiroBuy(STOCK_ISIN, "10-01-2024", "buy-1")].join("\n"),
    );

    const result = await runClassifyCapture([csvPath], {});
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(dir, "file.classify.json"))).toBe(true);
  });

  it("N>1 without --sidecar → exit 2, errorMultiFileOutputRequired", async () => {
    const dir = makeTmpDir();
    const csv1 = path.join(dir, "2023.csv");
    const csv2 = path.join(dir, "2024.csv");
    fs.writeFileSync(
      csv1,
      [DEGIRO_HEADER, degiroBuy(STOCK_ISIN, "10-01-2023", "buy-1")].join("\n"),
    );
    fs.writeFileSync(
      csv2,
      [DEGIRO_HEADER, degiroBuy(ETF_ISIN, "10-01-2024", "buy-2")].join("\n"),
    );

    const result = await runClassifyCapture([csv1, csv2], {});
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--sidecar");
  });
});

describe("TC-193: validate N>1 → per-file blocks, blank line, validateTotal aggregate", () => {
  it("two files with a cross-file duplicate → correct aggregate total", async () => {
    const dir = makeTmpDir();
    const csv2023 = path.join(dir, "2023.csv");
    const csv2024 = path.join(dir, "2024.csv");
    // 2024.csv's buy-1 row is identical (isin/date/type/qty/price/currency)
    // to 2023.csv's buy-1 row — a cross-file duplicate.
    fs.writeFileSync(
      csv2023,
      [DEGIRO_HEADER, degiroBuy(STOCK_ISIN, "10-01-2024", "buy-1")].join("\n"),
    );
    fs.writeFileSync(
      csv2024,
      [
        DEGIRO_HEADER,
        degiroBuy(STOCK_ISIN, "10-01-2024", "buy-1"),
        degiroUnsupportedCurrencyRow(ETF_ISIN, "05-02-2024", "buy-2"),
      ].join("\n"),
    );

    const result = await runValidateCapture([csv2023, csv2024], {});
    expect(result.exitCode).toBe(0);

    expect(result.stdout).toContain(`[${csv2023}] ` + itStrings.validateOk(1, 0));
    expect(result.stdout).toContain(`[${csv2024}] ` + itStrings.validateOk(1, 0));
    // 1 per-file warning (unsupported currency in 2024.csv) + 1 cross-file
    // duplicate-row warning = 2 total; 2 transactions parsed total.
    expect(result.stdout).toContain(itStrings.validateTotal(2, 2));
    expect(result.stdout).toContain("riga duplicata sospetta");
    // Aggregate line and duplicate warning come after a blank line.
    const totalIdx = result.stdout.indexOf("Totale:");
    const blankBeforeTotal = result.stdout.slice(0, totalIdx).endsWith("\n\n");
    expect(blankBeforeTotal).toBe(true);
  });
});

describe("TC-194: classify N>1 dedupes ISINs across the merged transaction list", () => {
  it("an ISIN present in both files appears once in the sidecar, all distinct ISINs covered", async () => {
    const dir = makeTmpDir();
    const csv2023 = path.join(dir, "2023.csv");
    const csv2024 = path.join(dir, "2024.csv");
    const sidecarOut = path.join(dir, "out.json");
    fs.writeFileSync(
      csv2023,
      [
        DEGIRO_HEADER,
        degiroBuy(STOCK_ISIN, "10-01-2023", "buy-1"),
        degiroBuy(BOND_ISIN, "15-01-2023", "buy-2"),
      ].join("\n"),
    );
    fs.writeFileSync(
      csv2024,
      [
        DEGIRO_HEADER,
        degiroBuy(STOCK_ISIN, "10-01-2024", "buy-3"),
        degiroBuy(ETF_ISIN, "15-01-2024", "buy-4"),
      ].join("\n"),
    );

    const result = await runClassifyCapture([csv2023, csv2024], {
      sidecar: sidecarOut,
    });
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(sidecarOut)).toBe(true);

    const sidecar = JSON.parse(fs.readFileSync(sidecarOut, "utf8"));
    const isins = Object.keys(sidecar.classifications);
    expect(isins.sort()).toEqual([BOND_ISIN, ETF_ISIN, STOCK_ISIN].sort());
    expect(isins).toHaveLength(3);
  });
});
