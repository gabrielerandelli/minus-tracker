import type {
  Transaction,
  MatchedLot,
  GainsReport,
  LotMethod,
} from "../types.js";
import { CalculationError } from "../errors.js";

interface Lot {
  date: string;
  quantity: number;
  pricePerUnitEUR: number;
  feesEUR: number;
  originalQty: number;
  fxRate?: number;
}

function roundHalfUp(x: number): number {
  return (Math.sign(x) * Math.round(Math.abs(x) * 100)) / 100;
}

function inferTaxYear(transactions: Transaction[]): {
  year: number;
  multipleYears: boolean;
} {
  const counts: Record<string, number> = {};
  for (const t of transactions) {
    const y = t.date.slice(0, 4);
    counts[y] = (counts[y] ?? 0) + 1;
  }
  const years = Object.keys(counts);
  if (years.length === 0)
    return { year: new Date().getFullYear(), multipleYears: false };
  const year = parseInt(
    years.reduce((a, b) => (counts[a] >= counts[b] ? a : b)),
  );
  return { year, multipleYears: years.length > 1 };
}

/**
 * Computes Italian capital gains and losses from a list of parsed transactions.
 *
 * Uses LIFO or FIFO lot matching and converts all amounts to EUR via ECB rates.
 */
export class Calculator {
  private readonly _transactions: Transaction[];
  private readonly _parseWarnings: string[];

  /**
   * @param transactions - Normalised Transaction objects from the CSV import step.
   * @param parseWarnings - Warnings collected during the import step; forwarded into the report.
   */
  constructor(transactions: Transaction[], parseWarnings?: string[]) {
    this._transactions = transactions;
    this._parseWarnings = parseWarnings ?? [];
  }

  /**
   * Run LIFO or FIFO lot-matching over the transaction list.
   *
   * @param method - `"LIFO"` or `"FIFO"`.
   * @returns GainsReport with `plusvalenze`, `minusvalenze`, `netResult`, per-lot breakdown,
   *          ECB rates used, and any accumulated warnings.
   * @throws {CalculationError} when a SELL has no matching open buy lots.
   *         `error.isin` and `error.date` identify the problematic transaction.
   */
  calculateGains(method: LotMethod): GainsReport {
    const warnings: string[] = [...this._parseWarnings];

    // 1. Sort ascending by date; BUY before SELL on same date
    const sorted = [...this._transactions].sort((a, b) => {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      // Same date: BUY before SELL
      if (a.type === "BUY" && b.type === "SELL") return -1;
      if (a.type === "SELL" && b.type === "BUY") return 1;
      return 0;
    });

    // 2. Tax year inference
    const { year: taxYear, multipleYears } = inferTaxYear(sorted);
    if (multipleYears) {
      warnings.push(
        "CSV contains transactions from multiple years — filter to a single year for accurate reporting.",
      );
    }

    // 3. Lot matching
    const openLots = new Map<string, Lot[]>();
    const matchedLots: MatchedLot[] = [];
    const ratesUsed: Record<string, number> = {};

    for (const tx of sorted) {
      // Collect rates used
      if (tx.fxRate !== undefined) {
        ratesUsed[`${tx.currency}:${tx.date}`] = tx.fxRate;
      }

      if (tx.type === "BUY") {
        const lot: Lot = {
          date: tx.date,
          quantity: tx.quantity,
          pricePerUnitEUR: tx.totalEUR / tx.quantity,
          feesEUR: tx.feesEUR,
          originalQty: tx.quantity,
          fxRate: tx.fxRate,
        };
        if (!openLots.has(tx.isin)) openLots.set(tx.isin, []);
        openLots.get(tx.isin)!.push(lot);
      } else {
        // SELL
        const lots = openLots.get(tx.isin);
        if (!lots || lots.length === 0) {
          throw new CalculationError(tx.isin, tx.date);
        }

        const sellPricePerUnitEUR = tx.totalEUR / tx.quantity;
        let remainingSellQty = tx.quantity;

        while (remainingSellQty > 0) {
          if (!lots || lots.length === 0) {
            throw new CalculationError(tx.isin, tx.date);
          }

          const lot = method === "LIFO" ? lots[lots.length - 1] : lots[0];
          const matchedQty = Math.min(lot.quantity, remainingSellQty);

          // Fee allocation
          const allocatedBuyFeesEUR =
            lot.feesEUR * (matchedQty / lot.originalQty);
          const allocatedSellFeesEUR = tx.feesEUR * (matchedQty / tx.quantity);

          const buyCostEUR =
            lot.pricePerUnitEUR * matchedQty + allocatedBuyFeesEUR;
          const sellProceedsEUR =
            sellPricePerUnitEUR * matchedQty - allocatedSellFeesEUR;
          const gainLossEUR = sellProceedsEUR - buyCostEUR;

          matchedLots.push({
            isin: tx.isin,
            product: tx.product,
            quantity: matchedQty,
            buyDate: lot.date,
            sellDate: tx.date,
            buyPriceEUR: lot.pricePerUnitEUR,
            sellPriceEUR: sellPricePerUnitEUR,
            buyCostEUR: roundHalfUp(buyCostEUR),
            sellProceedsEUR: roundHalfUp(sellProceedsEUR),
            gainLossEUR: roundHalfUp(gainLossEUR),
            buyFxRate: lot.fxRate,
            sellFxRate: tx.fxRate,
          });

          lot.quantity -= matchedQty;
          remainingSellQty -= matchedQty;

          if (lot.quantity <= 0) {
            if (method === "LIFO") {
              lots.pop();
            } else {
              lots.shift();
            }
          }
        }
      }
    }

    // 4. Aggregate
    let plusvalenze = 0;
    let minusvalenze = 0;
    for (const lot of matchedLots) {
      if (lot.gainLossEUR > 0) plusvalenze += lot.gainLossEUR;
      else minusvalenze += Math.abs(lot.gainLossEUR);
    }

    return {
      method,
      taxYear,
      plusvalenze: roundHalfUp(plusvalenze),
      minusvalenze: roundHalfUp(minusvalenze),
      netResult: roundHalfUp(plusvalenze - minusvalenze),
      lots: matchedLots,
      ratesUsed,
      warnings,
      generatedAt: new Date().toISOString(),
    };
  }
}
