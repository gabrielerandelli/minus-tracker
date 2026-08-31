import type {
  Transaction,
  MatchedLot,
  GainsReport,
  LotMethod,
  CalculatorOptions,
  AssetClass,
  BucketAReport,
  BucketBReport,
  CarryForwardEntry,
} from "../types.js";
import { CalculationError } from "../errors.js";
import {
  buildQuadroRT,
  buildQuadroRM,
  buildDichiarazioneReport,
} from "../dichiarazione/engine.js";

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

// Absorbs floating-point residue from repeated lot-quantity subtraction (e.g. 2.22e-17);
// real quantity mismatches between BUYs and SELLs are always many orders of magnitude larger.
const QUANTITY_EPSILON = 1e-9;

// Real fractional-share trading precision from brokers (DEGIRO, IBKR) tops out at 8 decimal
// places, while floating-point noise from a single JS subtraction is ~1e-15 to 1e-17 — many
// orders of magnitude finer. Snapping every matched/remaining/open-lot quantity to
// QUANTITY_DECIMALS places after each arithmetic step (rather than only zeroing near-zero
// residue) keeps that noise from ever being *carried forward* into the next lot-matching
// iteration — where Math.min(lot.quantity, remainingSellQty) would otherwise copy a noisy
// value like 0.19999999999999998 verbatim into a matched lot's `quantity` — while still
// leaving real quantity mismatches (which are always orders of magnitude larger than 1e-8)
// fully distinguishable, so genuine oversells are still rejected.
const QUANTITY_DECIMALS = 8;
const QUANTITY_SCALE = 10 ** QUANTITY_DECIMALS;

function roundQty(x: number): number {
  if (Math.abs(x) < QUANTITY_EPSILON) return 0;
  return Math.round(x * QUANTITY_SCALE) / QUANTITY_SCALE;
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
  private readonly _options: CalculatorOptions;

  constructor(
    transactions: Transaction[],
    parseWarnings?: string[],
    options?: CalculatorOptions,
  ) {
    this._transactions = transactions;
    this._parseWarnings = parseWarnings ?? [];
    this._options = options ?? {};
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
      if (tx.feesFxRate !== undefined && tx.feesCurrency !== undefined) {
        ratesUsed[`${tx.feesCurrency}:${tx.date}`] = tx.feesFxRate;
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
          // Both operands are already snapped to QUANTITY_DECIMALS (BUY lots start clean from
          // tx.quantity; carried-over lot/remaining quantities are re-snapped below), so
          // matchedQty — which flows verbatim into the public MatchedLot.quantity field — is
          // guaranteed clean too. roundQty() here is a defensive no-op in the common case, and
          // a real fix in the rare case a caller feeds in an already-noisy tx.quantity.
          const matchedQty = roundQty(Math.min(lot.quantity, remainingSellQty));

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

          // Snap immediately after subtracting: this both eliminates near-zero residue (as the
          // old QUANTITY_EPSILON-only check did) AND rounds any non-zero residue (e.g.
          // 0.9 - 0.7 -> 0.19999999999999998) to the nearest realistic trading precision, so the
          // *next* iteration's Math.min() reads a clean value instead of propagating noise into
          // another matched lot's quantity.
          lot.quantity = roundQty(lot.quantity - matchedQty);
          remainingSellQty = roundQty(remainingSellQty - matchedQty);

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

    // Two-bucket routing (only when classification map provided)
    if (this._options.classification) {
      const classification = this._options.classification;
      const unclassifiedIsins = new Set<string>();

      for (const lot of matchedLots) {
        const entry = classification[lot.isin];
        if (!entry) {
          lot.bucket = "B";
          unclassifiedIsins.add(lot.isin);
        } else if (entry.bucketGain === "A" && lot.gainLossEUR >= 0) {
          lot.bucket = "A";
        } else {
          lot.bucket = "B";
        }
      }

      for (const isin of unclassifiedIsins) {
        warnings.push(
          `ISIN ${isin} not found in classification map — assigned to Bucket B.`,
        );
      }

      // Bucket A computation
      const bucketALots = matchedLots.filter((l) => l.bucket === "A");
      const groupsByRate = new Map<
        number,
        { assetClasses: Set<string>; plusvalenze: number }
      >();
      for (const lot of bucketALots) {
        const entry = classification[lot.isin]!;
        const rate = entry.taxRate;
        if (!groupsByRate.has(rate))
          groupsByRate.set(rate, { assetClasses: new Set(), plusvalenze: 0 });
        const g = groupsByRate.get(rate)!;
        g.assetClasses.add(entry.assetClass);
        g.plusvalenze += lot.gainLossEUR;
      }
      const bucketAGroups = [...groupsByRate.entries()].map(([taxRate, g]) => ({
        taxRate,
        assetClasses: [...g.assetClasses] as AssetClass[],
        plusvalenze: roundHalfUp(g.plusvalenze),
        imposta: roundHalfUp(g.plusvalenze * taxRate),
      }));
      const bucketAReport: BucketAReport = {
        groups: bucketAGroups,
        totalImposta: roundHalfUp(
          bucketAGroups.reduce((s, g) => s + g.imposta, 0),
        ),
      };

      // Bucket B computation
      const bucketBLots = matchedLots.filter((l) => l.bucket === "B");
      let bPlusvalenze = 0;
      let bMinusvalenze = 0;
      for (const lot of bucketBLots) {
        if (lot.gainLossEUR >= 0) bPlusvalenze += lot.gainLossEUR;
        else bMinusvalenze += Math.abs(lot.gainLossEUR);
      }
      bPlusvalenze = roundHalfUp(bPlusvalenze);
      bMinusvalenze = roundHalfUp(bMinusvalenze);

      const carryForwards = [...(this._options.carryForward ?? [])].sort(
        (a, b) => a.year - b.year,
      );
      let remaining = bPlusvalenze - bMinusvalenze;
      let carryForwardApplied = 0;
      const carryForwardEntriesRemaining: CarryForwardEntry[] = [];
      for (const entry of carryForwards) {
        if (taxYear - entry.year > 4) continue;
        const consumed = remaining > 0 ? Math.min(entry.amount, remaining) : 0;
        carryForwardApplied += consumed;
        remaining -= consumed;
        const residual = roundHalfUp(entry.amount - consumed);
        if (residual > 0) {
          carryForwardEntriesRemaining.push({
            annoOrigine: entry.year,
            importo: residual,
          });
        }
      }
      carryForwardApplied = roundHalfUp(carryForwardApplied);
      const bNetResult = roundHalfUp(
        bPlusvalenze - bMinusvalenze - carryForwardApplied,
      );
      const carryForwardRemaining = roundHalfUp(Math.max(0, -bNetResult));

      const bucketBReport: BucketBReport = {
        plusvalenze: bPlusvalenze,
        minusvalenze: bMinusvalenze,
        carryForwardApplied,
        carryForwardRemaining,
        carryForwardEntriesRemaining,
        netResult: bNetResult,
      };

      // Filter income rows to the tax year and build the dichiarazione report
      // Note: row.date is a plain ISO "YYYY-MM-DD" string. We deliberately avoid
      // constructing a Date object here and reading getFullYear() from it — that
      // parses the string as UTC midnight but reads the year back in the host
      // machine's LOCAL timezone, which silently shifts the year for any negative
      // UTC offset (e.g. "2024-01-01" becomes 2023 in America/New_York). Slicing
      // the year directly out of the ISO string sidesteps timezone conversion
      // entirely, matching the pattern already used by inferTaxYear() above.
      const allIncomeRows = this._options.incomeRows ?? [];
      const filteredIncomeRows = allIncomeRows.filter(
        (row) => parseInt(row.date.slice(0, 4), 10) === taxYear,
      );
      if (filteredIncomeRows.length < allIncomeRows.length) {
        warnings.push(`Income rows outside tax year ${taxYear} were skipped.`);
      }

      const quadroRT = buildQuadroRT(
        bucketBReport,
        this._options.carryForward ?? [],
        taxYear,
      );
      const quadroRM = buildQuadroRM(
        bucketAGroups.length > 0 ? bucketAReport : undefined,
        filteredIncomeRows,
        taxYear,
      );
      const dichiarazioneReport = buildDichiarazioneReport(
        quadroRT,
        quadroRM,
        taxYear,
      );

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
        bucketA: bucketAGroups.length > 0 ? bucketAReport : undefined,
        bucketB: bucketBReport,
        dichiarazione: dichiarazioneReport,
      };
    } else {
      // Mixed-asset heuristic (no classification map)
      const allIsins = [...new Set(this._transactions.map((t) => t.isin))];
      const hasIePrefix = allIsins.some((isin) => isin.startsWith("IE"));
      const hasOther = allIsins.some((isin) => !isin.startsWith("IE"));
      if (hasIePrefix && hasOther) {
        warnings.push(
          "WARNING: CSV contains mixed instrument types (e.g. ETFs + Stocks).\n" +
            "   Single-bucket calculation may not be fiscally correct.\n" +
            "   Run: minus-tracker classify trades.csv",
        );
      }
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
