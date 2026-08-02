import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Writable } from "node:stream";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runCli } from "../src/cli/index.js";
import { it as itStrings } from "../src/i18n/it.js";
import { en as enStrings } from "../src/i18n/en.js";

/**
 * Category 21 — Broker Detection & CLI `--broker` (v0.11.0), CLI-level halves.
 * TC-159 through TC-163, from docs/test_plan/21-broker-detection-cli.md.
 *
 * Invokes runCli() end-to-end (not runCalc/runValidate/runClassify directly,
 * and not detectBroker() directly — that's covered by the standalone unit
 * tests in test/broker-detect-unit.test.ts) so the --broker flag wiring in
 * src/cli/index.ts and the broker-resolution block in each command are
 * exercised together.
 */

const DEGIRO_HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";
const DEGIRO_ROW_BUY =
  "14-01-2024,09:05,Apple Inc,US0378331005,XNAS,XNAS,10,150.00,-1500.00,EUR,-1500.00,EUR,1,-2.00,EUR,-1502.00,EUR,abc-123";
const DEGIRO_ROW_SELL =
  "15-03-2024,14:20,Apple Inc,US0378331005,XNAS,XNAS,-10,180.00,1800.00,EUR,1800.00,EUR,1,-2.00,EUR,1798.00,EUR,abc-456";
const VALID_DEGIRO_CSV = [DEGIRO_HEADER, DEGIRO_ROW_BUY, DEGIRO_ROW_SELL].join(
  "\n",
);

// Dividends section precedes Trades — Trades header is NOT on line 1 (TC-160).
const IBKR_CSV_DIVIDENDS_BEFORE_TRADES = [
  "Dividends,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
  "Dividends,Data,EUR,IE00BK5BQT80,VWCE,20240315,VWCE DIVIDEND,10.00",
  "Trades,Header,DataDiscriminator,AssetCategory,CurrencyPrimary,Symbol,Description,ISIN,TradeDate,Buy/Sell,Quantity,TradePrice,IBCommission,IBCommissionCurrency",
  "Trades,Data,Order,STK,EUR,VWCE,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,20240102,BUY,5,95.00,-1.00,EUR",
].join("\n");

const UNRELATED_CSV = "Name,Age,City\n1,2,3\n";

const BOM = "﻿";

function captureStream(): { stream: Writable; output: () => string } {
  let buf = "";
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  return { stream, output: () => buf };
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "broker-detection-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFixture(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

describe("TC-159: DEGIRO signature auto-detected as degiro (no --broker)", () => {
  it("calc exits 0 and produces DEGIROParser-parsed output", async () => {
    const filePath = writeFixture("degiro.csv", VALID_DEGIRO_CSV);
    const out = captureStream();
    const err = captureStream();

    const code = await runCli(
      ["calc", "--offline", filePath],
      out.stream,
      err.stream,
    );

    expect(code).toBe(0);
    expect(out.output()).toContain("296");
  });
});

describe("TC-160: IBKR signature detected regardless of section order (no --broker)", () => {
  it("calc exits 0 and produces IBKRParser-parsed output", async () => {
    const filePath = writeFixture("ibkr.csv", IBKR_CSV_DIVIDENDS_BEFORE_TRADES);
    const out = captureStream();
    const err = captureStream();

    const code = await runCli(
      ["calc", "--offline", filePath],
      out.stream,
      err.stream,
    );

    expect(code).toBe(0);
  });
});

describe("TC-161: neither signature matches → exit 2, errorBrokerDetectionFailed", () => {
  // --lang is passed explicitly (rather than relying on the "it" default) so
  // this test is independent of the user's persisted ~/.config/minus-tracker
  // locale setting, which other test suites (e.g. the `config` command's
  // tests) may have left in a non-default state.
  it("Italian locale (--lang it)", async () => {
    const filePath = writeFixture("unrelated.csv", UNRELATED_CSV);
    const out = captureStream();
    const err = captureStream();

    const code = await runCli(
      ["calc", "--lang", "it", filePath],
      out.stream,
      err.stream,
    );

    expect(code).toBe(2);
    expect(err.output()).toBe(itStrings.errorBrokerDetectionFailed + "\n");
  });

  it("English locale (--lang en)", async () => {
    const filePath = writeFixture("unrelated.csv", UNRELATED_CSV);
    const out = captureStream();
    const err = captureStream();

    const code = await runCli(
      ["calc", "--lang", "en", filePath],
      out.stream,
      err.stream,
    );

    expect(code).toBe(2);
    expect(err.output()).toBe(enStrings.errorBrokerDetectionFailed + "\n");
  });

  it("no parser is ever instantiated — exits before any parse attempt (validate)", async () => {
    const filePath = writeFixture("unrelated.csv", UNRELATED_CSV);
    const out = captureStream();
    const err = captureStream();

    const code = await runCli(
      ["validate", "--lang", "it", filePath],
      out.stream,
      err.stream,
    );

    expect(code).toBe(2);
    expect(err.output()).toBe(itStrings.errorBrokerDetectionFailed + "\n");
  });
});

describe("TC-162: --broker forces the parser and always skips detection", () => {
  it("calc --broker degiro on DEGIRO-shaped content matches auto-detection (sanity check)", async () => {
    const filePath = writeFixture("degiro.csv", VALID_DEGIRO_CSV);
    const out = captureStream();
    const err = captureStream();

    const code = await runCli(
      ["calc", "--broker", "degiro", "--offline", filePath],
      out.stream,
      err.stream,
    );

    expect(code).toBe(0);
    expect(out.output()).toContain("296");
  });

  it("calc --broker ibkr on DEGIRO-shaped content surfaces an IBKRParser-side hard error", async () => {
    const filePath = writeFixture("degiro.csv", VALID_DEGIRO_CSV);
    const out = captureStream();
    const err = captureStream();

    const code = await runCli(
      ["calc", "--broker", "ibkr", "--offline", "--lang", "it", filePath],
      out.stream,
      err.stream,
    );

    expect(code).toBe(1);
    expect(err.output()).toBe(itStrings.errorMissingSection("Trades") + "\n");
  });

  it("validate --broker ibkr on DEGIRO-shaped content surfaces the same hard error", async () => {
    const filePath = writeFixture("degiro.csv", VALID_DEGIRO_CSV);
    const out = captureStream();
    const err = captureStream();

    const code = await runCli(
      ["validate", "--broker", "ibkr", "--lang", "it", filePath],
      out.stream,
      err.stream,
    );

    expect(code).toBe(1);
    expect(err.output()).toBe(itStrings.errorMissingSection("Trades") + "\n");
  });

  it("classify --broker ibkr on DEGIRO-shaped content surfaces the same hard error", async () => {
    const filePath = writeFixture("degiro.csv", VALID_DEGIRO_CSV);
    const out = captureStream();
    const err = captureStream();

    const code = await runCli(
      ["classify", "--broker", "ibkr", "--offline", "--lang", "it", filePath],
      out.stream,
      err.stream,
    );

    expect(code).toBe(1);
    expect(err.output()).toBe(itStrings.errorMissingSection("Trades") + "\n");
  });
});

describe("TC-163: leading UTF-8 BOM stripped before broker detection", () => {
  it("BOM-prefixed DEGIRO file auto-detects and parses successfully via calc", async () => {
    const filePath = writeFixture("degiro-bom.csv", BOM + VALID_DEGIRO_CSV);
    const out = captureStream();
    const err = captureStream();

    const code = await runCli(
      ["calc", "--offline", filePath],
      out.stream,
      err.stream,
    );

    expect(code).toBe(0);
    expect(out.output()).toContain("296");
  });

  it("BOM-prefixed IBKR file auto-detects and parses successfully via calc", async () => {
    const filePath = writeFixture(
      "ibkr-bom.csv",
      BOM + IBKR_CSV_DIVIDENDS_BEFORE_TRADES,
    );
    const out = captureStream();
    const err = captureStream();

    const code = await runCli(
      ["calc", "--offline", filePath],
      out.stream,
      err.stream,
    );

    expect(code).toBe(0);
  });
});

describe("--broker invalid value → exit 2, usage error (not a detection failure)", () => {
  it("rejects an unrecognized --broker value", async () => {
    const filePath = writeFixture("degiro.csv", VALID_DEGIRO_CSV);
    const out = captureStream();
    const err = captureStream();

    const code = await runCli(
      ["calc", "--broker", "schwab", filePath],
      out.stream,
      err.stream,
    );

    expect(code).toBe(2);
    expect(err.output()).toBe("--broker must be degiro or ibkr\n");
  });
});
