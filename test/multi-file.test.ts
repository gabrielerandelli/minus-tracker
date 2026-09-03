import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  parseMultipleFiles,
  MultiFileError,
  multiFileTag,
} from "../src/cli/multi-file.js";
import { DEGIROParser } from "../src/parser/index.js";
import { ParseError } from "../src/errors.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * Task 52 — Multi-File Parse/Merge Pipeline (docs/impl_plan.md, v0.11.2).
 * TC-180, TC-181, TC-186 through TC-192, from docs/test_plan.md.
 *
 * Exercises `parseMultipleFiles()` directly (the CLI commands themselves —
 * `calc`/`validate`/`classify` N-file wiring — are Tasks 53-55, not yet
 * built) against real temp CSV fixtures on disk, matching the CLI's own
 * read-from-path contract.
 */

const DEGIRO_HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

function degiroRow(opts: {
  date: string; // DD-MM-YYYY
  isin: string;
  quantity: number; // positive = BUY, negative = SELL
  price: number;
  currency?: string;
  fees?: number;
  orderId?: string;
}): string {
  const {
    date,
    isin,
    quantity,
    price,
    currency = "EUR",
    fees = 2,
    orderId = "ord-1",
  } = opts;
  const localValue = -quantity * price;
  const total = localValue - fees;
  return [
    date,
    "09:05",
    "Test Product",
    isin,
    "XNAS",
    "XNAS",
    String(quantity),
    price.toFixed(2),
    localValue.toFixed(2),
    currency,
    localValue.toFixed(2),
    currency,
    "1",
    (-fees).toFixed(2),
    currency,
    total.toFixed(2),
    currency,
    orderId,
  ].join(",");
}

const ISIN = "US0378331005";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "multi-file-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFixture(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

describe("TC-180: N=1 multi-file input is byte-for-byte unchanged", () => {
  it("produces the exact same Transaction[] as parsing the file directly", () => {
    const csv = [
      DEGIRO_HEADER,
      degiroRow({ date: "02-01-2024", isin: ISIN, quantity: 10, price: 100 }),
      degiroRow({ date: "03-06-2024", isin: ISIN, quantity: -10, price: 150 }),
    ].join("\n");
    const filePath = writeFixture("single.csv", csv);

    const direct = new DEGIROParser().parse(csv);
    const result = parseMultipleFiles([filePath]);

    expect(result.transactions).toEqual(direct);
    expect(result.incomeRows).toEqual([]);
    expect(result.duplicateRows).toEqual([]);
  });

  it("does not prepend a file tag to per-file warnings at N=1", () => {
    const csv = [
      DEGIRO_HEADER,
      // Blank ISIN, non-zero quantity -> MISSING_ISIN warning, row skipped.
      ',09:05,Test Product,,XNAS,XNAS,10,100.00,-1000.00,EUR,-1000.00,EUR,1,-2.00,EUR,-1002.00,EUR,ord-2'.replace(
        /^,/,
        "02-01-2024,",
      ),
    ].join("\n");
    const filePath = writeFixture("warn.csv", csv);

    const result = parseMultipleFiles([filePath]);

    expect(result.transactions).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).not.toMatch(/^\[/);
    expect(result.warnings[0]).toContain("missing ISIN");
  });

  it("multiFileTag() itself is a no-op at N=1 (the structural mechanism behind TC-180)", () => {
    expect(multiFileTag("a.csv", false)).toBe("");
    expect(multiFileTag("a.csv", true)).toBe("[a.csv] ");
  });
});

describe("TC-181: duplicate resolved file path", () => {
  it("throws MultiFileError('DUPLICATE_FILE_PATH') when the same path is given twice", () => {
    const csv = [
      DEGIRO_HEADER,
      degiroRow({ date: "02-01-2024", isin: ISIN, quantity: 10, price: 100 }),
    ].join("\n");
    const filePath = writeFixture("a.csv", csv);

    expect(() => parseMultipleFiles([filePath, filePath])).toThrow(
      MultiFileError,
    );
    try {
      parseMultipleFiles([filePath, filePath]);
      throw new Error("expected parseMultipleFiles to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(MultiFileError);
      expect((err as MultiFileError).code).toBe("DUPLICATE_FILE_PATH");
    }
  });

  it("catches duplicates via differently-typed paths that resolve to the same file", () => {
    const csv = [DEGIRO_HEADER].join("\n");
    const filePath = writeFixture("b.csv", csv);
    const aliasPath = path.join(tmpDir, ".", "b.csv");

    try {
      parseMultipleFiles([filePath, aliasPath]);
      throw new Error("expected parseMultipleFiles to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(MultiFileError);
      expect((err as MultiFileError).code).toBe("DUPLICATE_FILE_PATH");
    }
  });

  it("runs before any file is read — a duplicated, nonexistent path still reports DUPLICATE_FILE_PATH", () => {
    const missing = path.join(tmpDir, "does-not-exist.csv");

    try {
      parseMultipleFiles([missing, missing]);
      throw new Error("expected parseMultipleFiles to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(MultiFileError);
      expect((err as MultiFileError).code).toBe("DUPLICATE_FILE_PATH");
    }
  });
});

describe("TC-186: a ParseError in a later file aborts the whole call", () => {
  it("propagates the underlying ParseError tagged with the failing (later) file, and only that file", () => {
    const goodCsv = [
      DEGIRO_HEADER,
      degiroRow({ date: "02-01-2024", isin: ISIN, quantity: 10, price: 100 }),
    ].join("\n");
    // Recognizable as DEGIRO (contains "Local value currency" on line 1, so
    // detectBroker() succeeds), but missing the required "ISIN" column —
    // genuinely reaches DEGIROParser.parse() and throws ParseError there.
    const badCsv =
      "Date,Time,Product,Exchange,Local value,Local value currency,Quantity,Price,Transaction costs,Transaction costs currency\nfoo,bar,baz,q,1,EUR,1,1,0,EUR";
    const file1 = writeFixture("good.csv", goodCsv);
    const file2 = writeFixture("bad.csv", badCsv);

    let caught: unknown;
    try {
      parseMultipleFiles([file1, file2]);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ParseError);
    expect((caught as ParseError).code).toBe("MISSING_COLUMN");
    expect((caught as ParseError).message.startsWith(`[${file2}] `)).toBe(
      true,
    );
    // The failing file's own tag only — file1 (which parsed fine) is not mentioned.
    expect((caught as ParseError).message).not.toContain(file1);
  });

  it("does not tag the message at N=1 (single-file behavior unchanged)", () => {
    const badCsv =
      "Date,Time,Product,Exchange,Local value,Local value currency,Quantity,Price,Transaction costs,Transaction costs currency\nfoo,bar,baz,q,1,EUR,1,1,0,EUR";
    const file1 = writeFixture("bad-solo.csv", badCsv);

    try {
      parseMultipleFiles([file1]);
      throw new Error("expected parseMultipleFiles to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).message).toBe(
        "Missing required column: ISIN",
      );
    }
  });
});

describe("TC-187: successful N-file parse merges chronologically-eligible transactions", () => {
  it("concatenates in file-argument order and preserves cross-file lot-matching eligibility", () => {
    const buyCsv = [
      DEGIRO_HEADER,
      degiroRow({ date: "02-01-2023", isin: ISIN, quantity: 10, price: 100 }),
    ].join("\n");
    const sellCsv = [
      DEGIRO_HEADER,
      degiroRow({
        date: "03-06-2024",
        isin: ISIN,
        quantity: -10,
        price: 150,
      }),
    ].join("\n");
    const file1 = writeFixture("2023.csv", buyCsv);
    const file2 = writeFixture("2024.csv", sellCsv);

    const result = parseMultipleFiles([file1, file2]);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].type).toBe("BUY");
    expect(result.transactions[0].date).toBe("2023-01-02");
    expect(result.transactions[1].type).toBe("SELL");
    expect(result.transactions[1].date).toBe("2024-06-03");

    // The BUY (file1) and SELL (file2) must be matchable by Calculator as
    // one lot spanning both files — proving the merge doesn't just
    // concatenate but keeps every transaction eligible for cross-file
    // lot matching.
    const report = new Calculator(result.transactions).calculateGains(
      "LIFO",
    );
    expect(report.lots).toHaveLength(1);
    expect(report.lots[0].buyDate).toBe("2023-01-02");
    expect(report.lots[0].sellDate).toBe("2024-06-03");
    expect(report.lots[0].quantity).toBe(10);
  });
});

describe("TC-188: cross-file duplicate-row detection warns, keeps both rows", () => {
  it("flags a matching row pair across two files without dropping either", () => {
    const row = degiroRow({
      date: "02-01-2024",
      isin: ISIN,
      quantity: 10,
      price: 100,
    });
    const file1 = writeFixture("acct1.csv", [DEGIRO_HEADER, row].join("\n"));
    const file2 = writeFixture("acct2.csv", [DEGIRO_HEADER, row].join("\n"));

    const result = parseMultipleFiles([file1, file2]);

    expect(result.transactions).toHaveLength(2); // both rows kept
    expect(result.duplicateRows).toHaveLength(1);
    expect(result.duplicateRows[0]).toEqual({
      file1,
      row1: 2,
      file2,
      row2: 2,
    });
    expect(
      result.warnings.some((w) => w.includes("suspected duplicate row")),
    ).toBe(true);
  });
});

describe("TC-189: same-file duplicate-looking rows are not flagged", () => {
  it("two identical-looking rows within one file produce no duplicateRows", () => {
    const row = degiroRow({
      date: "02-01-2024",
      isin: ISIN,
      quantity: 10,
      price: 100,
    });
    const file1 = writeFixture(
      "same-day.csv",
      [DEGIRO_HEADER, row, row].join("\n"),
    );

    const result = parseMultipleFiles([file1]);

    expect(result.transactions).toHaveLength(2);
    expect(result.duplicateRows).toEqual([]);
  });

  it("stays true even with a second, unrelated file present (cross-file only)", () => {
    const row = degiroRow({
      date: "02-01-2024",
      isin: ISIN,
      quantity: 10,
      price: 100,
    });
    const unrelatedRow = degiroRow({
      date: "05-02-2024",
      isin: "IE00BK5BQT80",
      quantity: 5,
      price: 42,
    });
    const file1 = writeFixture(
      "same-day2.csv",
      [DEGIRO_HEADER, row, row].join("\n"),
    );
    const file2 = writeFixture(
      "other.csv",
      [DEGIRO_HEADER, unrelatedRow].join("\n"),
    );

    const result = parseMultipleFiles([file1, file2]);

    expect(result.duplicateRows).toEqual([]);
  });
});

describe("TC-190: different currency avoids a false-positive duplicate match", () => {
  it("same isin/date/type/quantity/price but different currency is not flagged", () => {
    const eurRow = degiroRow({
      date: "02-01-2024",
      isin: ISIN,
      quantity: 10,
      price: 100,
      currency: "EUR",
    });
    // Real embedded ECB USD rate for 2024-01-02 so the row survives parsing.
    const usdRow = degiroRow({
      date: "02-01-2024",
      isin: ISIN,
      quantity: 10,
      price: 100,
      currency: "USD",
    });
    const file1 = writeFixture("eur.csv", [DEGIRO_HEADER, eurRow].join("\n"));
    const file2 = writeFixture("usd.csv", [DEGIRO_HEADER, usdRow].join("\n"));

    const result = parseMultipleFiles([file1, file2]);

    expect(result.transactions).toHaveLength(2);
    expect(result.duplicateRows).toEqual([]);
  });
});

describe("TC-191: IncomeRow[] is concatenated across files with no duplicate detection", () => {
  it("merges income rows in file-argument order even when they look identical", () => {
    const incomeRow =
      "02-01-2024,09:05,VWCE DIVIDEND,IE00BK5BQT80,XNAS,XNAS,,,10.00,EUR,10.00,EUR,1,,,,,ord-3";
    const file1 = writeFixture(
      "div1.csv",
      [DEGIRO_HEADER, incomeRow].join("\n"),
    );
    const file2 = writeFixture(
      "div2.csv",
      [DEGIRO_HEADER, incomeRow].join("\n"),
    );

    const result = parseMultipleFiles([file1, file2]);

    expect(result.incomeRows).toHaveLength(2);
    expect(result.incomeRows[0]).toEqual(result.incomeRows[1]);
    // No duplicate-row detection applies to IncomeRow[] — only Transaction[].
    expect(result.duplicateRows).toEqual([]);
  });
});

describe("TC-192: multiFileTag is prepended to per-file lines only when N>1", () => {
  it("tags each file's parser warnings when N=2", () => {
    const missingIsinRow =
      "02-01-2024,09:05,Test Product,,XNAS,XNAS,10,100.00,-1000.00,EUR,-1000.00,EUR,1,-2.00,EUR,-1002.00,EUR,ord-4";
    const file1 = writeFixture(
      "w1.csv",
      [DEGIRO_HEADER, missingIsinRow].join("\n"),
    );
    const cleanRow = degiroRow({
      date: "03-01-2024",
      isin: ISIN,
      quantity: 5,
      price: 50,
    });
    const file2 = writeFixture("w2.csv", [DEGIRO_HEADER, cleanRow].join("\n"));

    const result = parseMultipleFiles([file1, file2]);

    const fileWarning = result.warnings.find((w) => w.includes("missing ISIN"));
    expect(fileWarning).toBeDefined();
    expect(fileWarning!.startsWith(`[${file1}] `)).toBe(true);
  });

  it("does not tag at N=1 (regression guard alongside TC-180)", () => {
    const missingIsinRow =
      "02-01-2024,09:05,Test Product,,XNAS,XNAS,10,100.00,-1000.00,EUR,-1000.00,EUR,1,-2.00,EUR,-1002.00,EUR,ord-4";
    const file1 = writeFixture(
      "w3.csv",
      [DEGIRO_HEADER, missingIsinRow].join("\n"),
    );

    const result = parseMultipleFiles([file1]);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].startsWith("[")).toBe(false);
  });
});
