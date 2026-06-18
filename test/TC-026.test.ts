import { describe, it, expect } from "vitest";
import type { Transaction } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-026: Rounding — half-up to 2 decimal places on final output fields
 *
 * Verifies that MatchedLot fields (buyCostEUR, sellProceedsEUR, gainLossEUR)
 * are rounded to exactly 2 decimal places using half-up semantics.
 *
 * Scenario A — 1/3 fee split produces repeating decimal:
 *   Three separate BUY lots of 1 unit each @ 100 EUR (feesEUR=0 each).
 *   SELL 3 units @ 101 EUR, feesEUR=1.00.
 *   With LIFO, each of the 3 matches is 1 unit against tx.quantity=3:
 *     allocatedSellFeesEUR = 1.00 × (1/3) = 0.33333…
 *     sellProceedsEUR = 101 − 0.33333… = 100.6666…  →  100.67 (rounds up)
 *   Confirms digits beyond 2dp are discarded via half-up, not truncated.
 *
 * Scenario B — half-up .005 boundary:
 *   BUY 2 units @ 100 EUR with feesEUR=0.01; SELL 1 unit @ 100 EUR (feesEUR=0).
 *   matchedQty=1, originalQty=2:
 *     allocatedBuyFeesEUR = 0.01 × (1/2) = 0.005
 *     buyCostEUR = 100 + 0.005 = 100.005  →  100.01 (half-up: .5 rounds up)
 *   Confirms the rounding mode is half-up, not half-down or truncation.
 */

// ── Scenario A fixtures ────────────────────────────────────────────────────

const buyA1: Transaction = {
  isin: "TEST000000026A",
  product: "Test A",
  date: "2024-01-02",
  type: "BUY",
  quantity: 1,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: -100,
  totalEUR: 100,
  feesEUR: 0,
  fxRate: undefined,
};

const buyA2: Transaction = {
  isin: "TEST000000026A",
  product: "Test A",
  date: "2024-01-03",
  type: "BUY",
  quantity: 1,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: -100,
  totalEUR: 100,
  feesEUR: 0,
  fxRate: undefined,
};

const buyA3: Transaction = {
  isin: "TEST000000026A",
  product: "Test A",
  date: "2024-01-04",
  type: "BUY",
  quantity: 1,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: -100,
  totalEUR: 100,
  feesEUR: 0,
  fxRate: undefined,
};

// SELL qty=3, feesEUR=1.00 → each matched unit gets 1/3 of fees
const sellA: Transaction = {
  isin: "TEST000000026A",
  product: "Test A",
  date: "2024-06-03",
  type: "SELL",
  quantity: 3,
  pricePerUnit: 101,
  currency: "EUR",
  totalLocal: 303,
  totalEUR: 303,
  feesEUR: 1.0,
  fxRate: undefined,
};

// ── Scenario B fixtures ────────────────────────────────────────────────────

// BUY 2 units, feesEUR=0.01 — only 1 unit will be sold
const buyB: Transaction = {
  isin: "TEST000000026B",
  product: "Test B",
  date: "2024-01-02",
  type: "BUY",
  quantity: 2,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: -200,
  totalEUR: 200,
  feesEUR: 0.01,
  fxRate: undefined,
};

// SELL only 1 unit → allocatedBuyFees = 0.01 × (1/2) = 0.005
const sellB: Transaction = {
  isin: "TEST000000026B",
  product: "Test B",
  date: "2024-06-03",
  type: "SELL",
  quantity: 1,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: 100,
  totalEUR: 100,
  feesEUR: 0,
  fxRate: undefined,
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("TC-026: Rounding — half-up to 2 decimal places on final output fields", () => {
  // ── Scenario A: 1/3 fee split → 0.6666… rounds to 0.67 ─────────────────

  describe("Scenario A — 1/3 fee allocation produces repeating decimal", () => {
    const report = new Calculator([buyA1, buyA2, buyA3, sellA]).calculateGains(
      "LIFO",
    );

    it("produces exactly 3 matched lots", () => {
      expect(report.lots).toHaveLength(3);
    });

    it("each lot's sellProceedsEUR is exactly 100.67 (not 100.6666…)", () => {
      for (const lot of report.lots) {
        expect(lot.sellProceedsEUR).toBe(100.67);
      }
    });

    it("sellProceedsEUR has at most 2 decimal places", () => {
      for (const lot of report.lots) {
        const asString = lot.sellProceedsEUR.toString();
        const decimalPart = asString.includes(".")
          ? asString.split(".")[1]
          : "";
        expect(decimalPart.length).toBeLessThanOrEqual(2);
      }
    });

    it("gainLossEUR per lot is 0.67 (101 − 1/3 fee − 100, rounded)", () => {
      for (const lot of report.lots) {
        expect(lot.gainLossEUR).toBe(0.67);
      }
    });

    it("plusvalenze equals sum of rounded lot gains (3 × 0.67 = 2.01)", () => {
      expect(report.plusvalenze).toBe(2.01);
    });
  });

  // ── Scenario B: 0.005 rounds up (half-up), not down ─────────────────────

  describe("Scenario B — 0.005 half-up boundary for buyCostEUR", () => {
    const report = new Calculator([buyB, sellB]).calculateGains("LIFO");

    it("produces exactly 1 matched lot", () => {
      expect(report.lots).toHaveLength(1);
    });

    it("buyCostEUR is 100.01 — half-up: 100.005 rounds up to 100.01, not 100.00", () => {
      expect(report.lots[0].buyCostEUR).toBe(100.01);
    });

    it("buyCostEUR is not 100.00 — confirms half-up, not truncation", () => {
      expect(report.lots[0].buyCostEUR).not.toBe(100.0);
    });

    it("buyCostEUR has at most 2 decimal places", () => {
      const asString = report.lots[0].buyCostEUR.toString();
      const decimalPart = asString.includes(".") ? asString.split(".")[1] : "";
      expect(decimalPart.length).toBeLessThanOrEqual(2);
    });

    it("gainLossEUR has at most 2 decimal places (rounded independently from raw values)", () => {
      // gainLossEUR is computed from the raw (unrounded) buyCostEUR and sellProceedsEUR,
      // not from their rounded counterparts. Due to FP cancellation when subtracting
      // 100 from 100.005, the raw delta is -0.00499... (less negative than -0.005),
      // which rounds to -0. This is expected behaviour — each field is rounded independently.
      const asString = Math.abs(report.lots[0].gainLossEUR).toString();
      const decimalPart = asString.includes(".") ? asString.split(".")[1] : "";
      expect(decimalPart.length).toBeLessThanOrEqual(2);
    });
  });
});
