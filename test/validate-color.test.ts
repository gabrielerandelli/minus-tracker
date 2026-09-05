import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { runValidate } from "../src/cli/commands/validate.js";
import { it as itStrings } from "../src/i18n/it.js";
import { stripAnsi } from "../src/cli/colors.js";

/**
 * Task 59: `validate` command coloring.
 *
 * TC-217: N=1 `OK:`/warning lines colored green/amber by that file's own warning count.
 * TC-218: N>1 `Totale:` line colored by its own aggregate warning count (all per-file
 * warnings + cross-file duplicate rows), not re-derived from the last per-file block.
 */

const DEGIRO_HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

const STOCK_ISIN = "US0378331005";

function degiroBuy(isin: string, date: string, orderId: string): string {
  return `${date},09:00,Product ${isin},${isin},XNAS,XNAS,10,100.00,-1000.00,EUR,-1000.00,EUR,1,0.00,EUR,-1000.00,EUR,${orderId}`;
}
// Unsupported currency row — deliberately warning-worthy, to exercise the per-file
// warning path.
function degiroUnsupportedCurrencyRow(
  isin: string,
  date: string,
  orderId: string,
): string {
  return `${date},09:00,Product ${isin},${isin},XNAS,XNAS,5,50.00,-250.00,XYZ,-250.00,XYZ,1,0.00,XYZ,-250.00,XYZ,${orderId}`;
}

interface CaptureResult {
  exitCode: number;
  stdout: string;
}

async function runValidateCapture(
  args: string[],
  color: boolean,
): Promise<CaptureResult> {
  let stdoutBuf = "";
  const mockStdout = new Writable({
    write(chunk, _enc, cb) {
      stdoutBuf += chunk.toString();
      cb();
    },
  });
  const mockStderr = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  const exitCode = await runValidate(args, {}, itStrings, mockStdout, mockStderr, color);
  return { exitCode, stdout: stdoutBuf };
}

let tmpDirs: string[] = [];
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-color-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

const GREEN = "\x1b[38;2;74;222;128m"; // #4ADE80
const AMBER = "\x1b[38;2;251;191;36m"; // #FBBF24

describe("TC-217: validate N=1 OK:/warning lines colored by own warning count", () => {
  it("clean file → OK: line is green, no ANSI otherwise", async () => {
    const dir = makeTmpDir();
    const csvPath = path.join(dir, "file.csv");
    fs.writeFileSync(
      csvPath,
      [DEGIRO_HEADER, degiroBuy(STOCK_ISIN, "10-01-2024", "buy-1")].join("\n"),
    );

    const result = await runValidateCapture([csvPath], true);
    expect(result.exitCode).toBe(0);
    const okLine = result.stdout.split("\n")[0];
    expect(okLine.startsWith(GREEN)).toBe(true);
    expect(okLine).not.toContain(AMBER);
  });

  it("file with a warning → both the OK: line and the warning line are amber", async () => {
    const dir = makeTmpDir();
    const csvPath = path.join(dir, "file.csv");
    fs.writeFileSync(
      csvPath,
      [
        DEGIRO_HEADER,
        degiroBuy(STOCK_ISIN, "10-01-2024", "buy-1"),
        degiroUnsupportedCurrencyRow(STOCK_ISIN, "11-01-2024", "buy-2"),
      ].join("\n"),
    );

    const result = await runValidateCapture([csvPath], true);
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.split("\n").filter(Boolean);
    expect(lines.length).toBe(2);
    // The "OK:" line's text is unchanged, but it is colored amber, not green, because
    // this file has at least one warning below it.
    expect(lines[0].startsWith(AMBER)).toBe(true);
    expect(lines[0]).not.toContain(GREEN);
    expect(lines[1].startsWith(AMBER)).toBe(true);
  });

  it("color: false produces no ANSI escapes at all", async () => {
    const dir = makeTmpDir();
    const csvPath = path.join(dir, "file.csv");
    fs.writeFileSync(
      csvPath,
      [
        DEGIRO_HEADER,
        degiroBuy(STOCK_ISIN, "10-01-2024", "buy-1"),
        degiroUnsupportedCurrencyRow(STOCK_ISIN, "11-01-2024", "buy-2"),
      ].join("\n"),
    );

    const result = await runValidateCapture([csvPath], false);
    expect(result.stdout).toBe(stripAnsi(result.stdout));
  });

  it("stripping color yields byte-identical text to the uncolored run", async () => {
    const dir = makeTmpDir();
    const csvPath = path.join(dir, "file.csv");
    fs.writeFileSync(
      csvPath,
      [
        DEGIRO_HEADER,
        degiroBuy(STOCK_ISIN, "10-01-2024", "buy-1"),
        degiroUnsupportedCurrencyRow(STOCK_ISIN, "11-01-2024", "buy-2"),
      ].join("\n"),
    );

    const colored = await runValidateCapture([csvPath], true);
    const uncolored = await runValidateCapture([csvPath], false);
    expect(stripAnsi(colored.stdout)).toBe(uncolored.stdout);
  });
});

describe("TC-218: validate N>1 Totale: line colored by its own aggregate warning count", () => {
  it("all files clean → Totale: line is green", async () => {
    const dir = makeTmpDir();
    const csv1 = path.join(dir, "a.csv");
    const csv2 = path.join(dir, "b.csv");
    fs.writeFileSync(
      csv1,
      [DEGIRO_HEADER, degiroBuy(STOCK_ISIN, "10-01-2023", "buy-1")].join("\n"),
    );
    fs.writeFileSync(
      csv2,
      [DEGIRO_HEADER, degiroBuy(STOCK_ISIN, "10-01-2024", "buy-2")].join("\n"),
    );

    const result = await runValidateCapture([csv1, csv2], true);
    expect(result.exitCode).toBe(0);
    const totaleLine = result.stdout
      .split("\n")
      .find((l) => stripAnsi(l).startsWith("Totale:"));
    expect(totaleLine).toBeDefined();
    expect(totaleLine!.startsWith(GREEN)).toBe(true);
  });

  it(
    "earlier file has a warning but the LAST file is clean → Totale: line is still amber " +
      "(regression guard: must use the aggregate, not the last-rendered block's status)",
    async () => {
      const dir = makeTmpDir();
      const csv1 = path.join(dir, "a.csv");
      const csv2 = path.join(dir, "b.csv");
      fs.writeFileSync(
        csv1,
        [
          DEGIRO_HEADER,
          degiroUnsupportedCurrencyRow(STOCK_ISIN, "10-01-2023", "buy-1"),
        ].join("\n"),
      );
      fs.writeFileSync(
        csv2,
        [DEGIRO_HEADER, degiroBuy(STOCK_ISIN, "10-01-2024", "buy-2")].join("\n"),
      );

      const result = await runValidateCapture([csv1, csv2], true);
      expect(result.exitCode).toBe(0);

      const lines = result.stdout.split("\n");
      const secondBlockOkLine = lines.find(
        (l) => stripAnsi(l).includes("[") && stripAnsi(l).includes(csv2),
      );
      // The last file's own block is clean → green.
      expect(secondBlockOkLine).toBeDefined();
      expect(secondBlockOkLine!.startsWith(GREEN)).toBe(true);

      // But the aggregate Totale: line must still be amber, since file 1 had a warning.
      const totaleLine = lines.find((l) => stripAnsi(l).startsWith("Totale:"));
      expect(totaleLine).toBeDefined();
      expect(totaleLine!.startsWith(AMBER)).toBe(true);
      expect(totaleLine).not.toContain(GREEN);
    },
  );
});
