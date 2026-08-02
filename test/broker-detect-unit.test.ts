import { describe, it, expect } from "vitest";
import { detectBroker } from "../src/cli/broker-detect.js";

/**
 * Task 43 — Broker Detection Module (standalone unit tests).
 *
 * Covers the 4 acceptance criteria from docs/impl_plan.md "### Task 43":
 * TC-159 (detection logic), TC-160 (Trades header not on line 1),
 * TC-161 (trigger condition for null), TC-163 (BOM-before-detection).
 *
 * A later task (Task 46, CLI --broker wiring) creates the full CLI-level
 * `test/broker-detection.test.ts` suite; this file may be extended or
 * superseded by that one.
 */

const DEGIRO_HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";
const DEGIRO_ROW =
  "14-01-2024,09:05,Apple Inc,US0378331005,XNAS,XNAS,10,150.00,-1500.00,USD,-1500.00,USD,1,-2.00,USD,-1502.00,USD,abc-123";
const VALID_DEGIRO_CSV = [DEGIRO_HEADER, DEGIRO_ROW].join("\n");

const IBKR_TRADES_HEADER =
  "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,Proceeds,Comm/Fee,Basis,Realized P/L,Code";
const IBKR_TRADES_ROW =
  "Trades,Data,Order,Stocks,USD,AAPL,2024-01-14,10,150.00,-1500.00,-2.00,1502.00,0,";
const DIVIDENDS_SECTION_HEADER =
  "Dividends,Header,Currency,Date,Description,Amount";
const DIVIDENDS_SECTION_ROW =
  "Dividends,Data,USD,2024-06-03,AAPL(US0378331005) Cash Dividend,35.00";

// Dividends section appears first — Trades header is NOT on line 1 (TC-160).
const CSV_WITH_DIVIDENDS_BEFORE_TRADES = [
  DIVIDENDS_SECTION_HEADER,
  DIVIDENDS_SECTION_ROW,
  IBKR_TRADES_HEADER,
  IBKR_TRADES_ROW,
].join("\n");

const UNRELATED_CSV = "Name,Age,City\n1,2,3\n";

const BOM = "﻿";

describe("detectBroker (Task 43)", () => {
  it("returns 'degiro' when line 1 contains 'Local value currency'", () => {
    expect(detectBroker(VALID_DEGIRO_CSV)).toBe("degiro");
  });

  it("returns 'ibkr' when a 'Trades,Header,...' line exists but is not line 1 (TC-160)", () => {
    expect(detectBroker(CSV_WITH_DIVIDENDS_BEFORE_TRADES)).toBe("ibkr");
  });

  it("returns null for an unrelated CSV (TC-161 trigger condition)", () => {
    expect(detectBroker(UNRELATED_CSV)).toBeNull();
  });

  it("detects 'degiro' through a leading UTF-8 BOM (TC-163)", () => {
    expect(detectBroker(BOM + VALID_DEGIRO_CSV)).toBe("degiro");
  });

  it("detects 'ibkr' through a leading UTF-8 BOM (TC-163)", () => {
    expect(detectBroker(BOM + CSV_WITH_DIVIDENDS_BEFORE_TRADES)).toBe("ibkr");
  });
});
