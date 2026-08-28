import { Transaction, IncomeRow, Parser } from "../types.js";
import { ParseError } from "../errors.js";
import {
  lookupRate,
  getActiveSnapshot,
  RatesSnapshot,
} from "../rates/index.js";
import { WarningEntry, warningToEnglish } from "./warnings.js";
import { checkCsvValidity } from "./validity.js";
import { parseNumericField } from "./numeric.js";
import {
  allocateWithholding,
  WithholdingJoinCandidate,
} from "./withholding-join.js";

// The 4 sections this parser understands. Any other section name (e.g.
// "Cash Report") is ignored entirely — forward-compatible with Flex Query
// sections this release doesn't model.
const KNOWN_SECTIONS = new Set([
  "Trades",
  "Dividends",
  "Withholding Tax",
  "Interest",
]);

// Order matters: first-missing is reported when validating the Trades
// section's header.
const TRADES_REQUIRED_COLUMNS = [
  "DataDiscriminator",
  "ISIN",
  "TradeDate",
  "Buy/Sell",
  "Quantity",
  "TradePrice",
  "CurrencyPrimary",
  "IBCommission",
  "IBCommissionCurrency",
] as const;

/**
 * Convert an IBKR date "YYYYMMDD" to ISO format "YYYY-MM-DD".
 */
function ibkrDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

interface IBKRIncomeCandidate {
  isin: string;
  product: string;
  date: string;
  incomeType: "dividend" | "coupon";
  amount: number; // absolute value, in source currency
  currency: string;
  row: number;
  section: "Dividends" | "Interest";
}

interface IBKRWithholdingCandidate {
  isin: string;
  date: string;
  currency: string;
  amount: number; // absolute value, in source currency
  row: number;
}

/**
 * Build a section's column-name → array-index map from its Header row.
 * The first two fields (section name, "Header") are skipped; the map stores
 * absolute indices into the row array, so the same map can be used directly
 * against that section's Data rows (which share the same field layout).
 */
function buildColIndex(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (let i = 2; i < headerRow.length; i++) {
    const name = (headerRow[i] ?? "").trim();
    if (name !== "") map[name] = i;
  }
  return map;
}

/**
 * Parses an IBKR Activity Flex Query CSV export into normalised Transaction
 * objects, plus income rows from the optional `Dividends` / `Withholding Tax`
 * / `Interest` sections (accessible via `incomeRows`).
 *
 * Export configuration: Activity Flex Query, CSV format, comma delimiter,
 * header rows included, date format `yyyyMMdd`. Sections are concatenated in
 * one file — see docs/prd/16-ibkr-parser.md for the full column spec.
 */
export class IBKRParser implements Parser {
  private _warningEntries: WarningEntry[] = [];
  private _snapshot?: RatesSnapshot;
  private _incomeRows: IncomeRow[] = [];

  constructor(snapshot?: RatesSnapshot) {
    this._snapshot = snapshot;
  }

  /**
   * Parse a combined multi-section IBKR Flex Query CSV export string.
   *
   * @param csv - Raw UTF-8 string from the IBKR Activity Flex Query export.
   * @returns Array of normalised Transaction objects (from the `Trades`
   *          section). Empty if no data rows are found.
   * @throws {ParseError} code `"INVALID_CSV"` — malformed CSV or binary content.
   * @throws {ParseError} code `"MISSING_SECTION"` (`sectionName: "Trades"`) —
   *         the `Trades` section is entirely absent from the file.
   * @throws {ParseError} code `"MISSING_COLUMN"` (+ `columnName`) — the
   *         `Trades` section is present but missing a required column (or has
   *         `Data` rows with no `Header` ever seen for it).
   *
   * Rows with missing ISIN, zero quantity, unsupported currency, or no ECB
   * rate within 3 trading days are skipped silently. Inspect `parser.warnings`
   * for details.
   */
  parse(csv: string): Transaction[] {
    this._warningEntries = [];
    this._incomeRows = [];

    const validity = checkCsvValidity(csv);
    if (!validity.valid) {
      throw new ParseError("INVALID_CSV");
    }
    const rows = validity.rows;

    const snapshot: RatesSnapshot = this._snapshot ?? getActiveSnapshot();

    const colIndexBySection = new Map<string, Record<string, number>>();
    const sectionRowCounters: Record<string, number> = {};
    let sawTrades = false;
    const transactions: Transaction[] = [];
    const incomeCandidates: IBKRIncomeCandidate[] = [];
    const withholdingCandidates: IBKRWithholdingCandidate[] = [];

    for (const row of rows) {
      if (row.every((cell) => cell.trim() === "")) continue;

      const sectionName = (row[0] ?? "").trim();
      const discriminator = (row[1] ?? "").trim();

      if (!KNOWN_SECTIONS.has(sectionName)) continue;

      if (discriminator === "Header") {
        colIndexBySection.set(sectionName, buildColIndex(row));
        if (sectionName === "Trades") sawTrades = true;
        continue;
      }

      if (discriminator === "Data") {
        if (sectionName === "Trades") {
          sawTrades = true;
          const colIndex = colIndexBySection.get("Trades");
          if (colIndex === undefined) {
            // No Trades header ever seen — structurally equivalent to every
            // required column being absent.
            throw new ParseError("MISSING_COLUMN", TRADES_REQUIRED_COLUMNS[0]);
          }
          const rowCounter = (sectionRowCounters["Trades"] =
            (sectionRowCounters["Trades"] ?? 0) + 1);
          const tx = this.parseTradesRow(row, colIndex, rowCounter, snapshot);
          if (tx) transactions.push(tx);
          continue;
        }

        // Dividends / Withholding Tax / Interest are optional sections. A
        // Data row with no header resolved yet for its section is skipped
        // silently (structurally malformed input for that section only —
        // never a hard error, unlike Trades).
        const colIndex = colIndexBySection.get(sectionName);
        if (colIndex === undefined) continue;

        const rowCounter = (sectionRowCounters[sectionName] =
          (sectionRowCounters[sectionName] ?? 0) + 1);

        if (sectionName === "Dividends") {
          const c = this.parseDividendsRow(row, colIndex, rowCounter);
          if (c) incomeCandidates.push(c);
        } else if (sectionName === "Withholding Tax") {
          const c = this.parseWithholdingRow(row, colIndex, rowCounter);
          if (c) withholdingCandidates.push(c);
        } else if (sectionName === "Interest") {
          const c = this.parseInterestRow(row, colIndex, rowCounter);
          if (c) incomeCandidates.push(c);
        }
        continue;
      }
      // Discriminator is neither "Header" nor "Data" — ignore.
    }

    if (!sawTrades) {
      throw new ParseError("MISSING_SECTION", "Trades");
    }

    const tradesColIndex = colIndexBySection.get("Trades")!;
    for (const col of TRADES_REQUIRED_COLUMNS) {
      if (tradesColIndex[col] === undefined) {
        throw new ParseError("MISSING_COLUMN", col);
      }
    }

    // --- FX-convert Withholding Tax candidates independently, per row ---
    // Each row keeps its own row number (not aggregated yet) so an orphan
    // withholding row can be reported individually (TC-152), unlike
    // DEGIROParser's aggregate-by-key orphan warning.
    const convertedWithholding: {
      key: string;
      amountEUR: number;
      row: number;
    }[] = [];
    for (const w of withholdingCandidates) {
      const key = `${w.isin}|${w.date}|${w.currency}`;
      if (w.currency === "EUR") {
        convertedWithholding.push({ key, amountEUR: w.amount, row: w.row });
        continue;
      }
      const rate = lookupRate(w.currency, w.date, snapshot);
      if (rate === null) {
        this._warningEntries.push({
          code: "NO_ECB_RATE",
          row: w.row,
          currency: w.currency,
          date: w.date,
          section: "Withholding Tax",
        });
        continue;
      }
      convertedWithholding.push({
        key,
        amountEUR: w.amount / rate,
        row: w.row,
      });
    }

    const totalsByKey = new Map<string, number>();
    for (const cw of convertedWithholding) {
      totalsByKey.set(cw.key, (totalsByKey.get(cw.key) ?? 0) + cw.amountEUR);
    }

    // --- FX-convert income candidates (Dividends + qualifying Interest) independently ---
    interface ConvertedIncome {
      candidate: IBKRIncomeCandidate;
      key: string;
      grossAmount: number;
      fxRate: number | undefined;
    }
    const convertedIncome: ConvertedIncome[] = [];
    for (const c of incomeCandidates) {
      const key = `${c.isin}|${c.date}|${c.currency}`;

      let grossAmount: number;
      let fxRate: number | undefined;

      if (c.currency === "EUR") {
        grossAmount = c.amount;
        fxRate = undefined;
      } else {
        const rate = lookupRate(c.currency, c.date, snapshot);
        if (rate === null) {
          this._warningEntries.push({
            code: "NO_ECB_RATE",
            row: c.row,
            currency: c.currency,
            date: c.date,
            section: c.section,
          });
          continue;
        }
        grossAmount = c.amount / rate;
        fxRate = rate;
      }

      convertedIncome.push({ candidate: c, key, grossAmount, fxRate });
    }

    // --- Join: allocate Withholding Tax totals across income rows sharing a key ---
    const joinCandidates: WithholdingJoinCandidate[] = convertedIncome.map(
      (ci) => ({ key: ci.key, grossAmount: ci.grossAmount }),
    );
    const allocatedWithholding = allocateWithholding(
      joinCandidates,
      totalsByKey,
    );

    const matchedKeys = new Set(convertedIncome.map((ci) => ci.key));

    const incomeRows: IncomeRow[] = convertedIncome.map((ci, i) => ({
      isin: ci.candidate.isin,
      product: ci.candidate.product,
      date: ci.candidate.date,
      incomeType: ci.candidate.incomeType,
      grossAmount: ci.grossAmount,
      withholdingTax: allocatedWithholding[i],
      currency: ci.candidate.currency,
      fxRate: ci.fxRate,
    }));

    // Orphan Withholding Tax rows — one warning per unmatched row (not per
    // key), since each row keeps its own section-relative row number.
    for (const cw of convertedWithholding) {
      if (!matchedKeys.has(cw.key)) {
        this._warningEntries.push({
          code: "UNMATCHED_WITHHOLDING",
          row: cw.row,
          section: "Withholding Tax",
        });
      }
    }

    this._incomeRows = incomeRows;

    return transactions;
  }

  /**
   * Parse one `Trades` `Data` row into a Transaction, or return `undefined`
   * if the row is out of scope or must be skipped (with a warning pushed).
   */
  private parseTradesRow(
    row: string[],
    colIndex: Record<string, number>,
    rowCounter: number,
    snapshot: RatesSnapshot,
  ): Transaction | undefined {
    const get = (col: string): string => {
      const idx = colIndex[col];
      return idx === undefined ? "" : (row[idx] ?? "").trim();
    };

    // --- Scope filter ---
    const dataDiscriminator = get("DataDiscriminator");
    const assetCategory = get("AssetCategory");
    if (dataDiscriminator !== "Order" || assetCategory === "CASH") {
      return undefined;
    }

    // --- ISIN ---
    const isin = get("ISIN");
    if (!isin) {
      this._warningEntries.push({
        code: "MISSING_ISIN",
        row: rowCounter,
        section: "Trades",
      });
      return undefined;
    }

    // --- Type & quantity ---
    const type = get("Buy/Sell") as "BUY" | "SELL";
    const rawQty = parseNumericField(get("Quantity"));
    const quantity = Math.abs(isNaN(rawQty) ? 0 : rawQty);
    if (quantity === 0) {
      this._warningEntries.push({
        code: "QUANTITY_ZERO",
        row: rowCounter,
        section: "Trades",
      });
      return undefined;
    }

    // --- Date ---
    const isoDate = ibkrDate(get("TradeDate"));

    // --- Trade-currency FX ---
    const currency = get("CurrencyPrimary");
    let fxRate: number | undefined;
    let ecbRate: number;
    if (currency === "EUR") {
      fxRate = undefined;
      ecbRate = 1;
    } else {
      const rate = lookupRate(currency, isoDate, snapshot);
      if (rate === null) {
        this._warningEntries.push({
          code: "NO_ECB_RATE",
          row: rowCounter,
          currency,
          date: isoDate,
          section: "Trades",
        });
        return undefined;
      }
      fxRate = rate;
      ecbRate = rate;
    }

    const tradePrice = parseNumericField(get("TradePrice"));
    const totalLocal = (type === "SELL" ? 1 : -1) * quantity * tradePrice;
    const totalEUR = Math.abs(totalLocal) / ecbRate;

    // --- Commission FX (independent lookup, per-decision) ---
    const commissionRaw = get("IBCommission");
    const commissionCurrency = get("IBCommissionCurrency");
    const commissionNum = parseNumericField(commissionRaw);

    let feesEUR: number;
    let feesFxRate: number | undefined;
    let feesCurrency: string | undefined;

    if (commissionRaw === "" || isNaN(commissionNum) || commissionNum === 0) {
      feesEUR = 0;
    } else if (commissionCurrency === "EUR") {
      feesEUR = Math.abs(commissionNum);
    } else {
      const commissionRate = lookupRate(commissionCurrency, isoDate, snapshot);
      if (commissionRate === null) {
        this._warningEntries.push({
          code: "NO_ECB_RATE",
          row: rowCounter,
          currency: commissionCurrency,
          date: isoDate,
          section: "Trades",
        });
        return undefined;
      }
      feesEUR = Math.abs(commissionNum) / commissionRate;
      if (commissionCurrency !== currency) {
        feesFxRate = commissionRate;
        feesCurrency = commissionCurrency;
      }
    }

    // --- Product (display name) ---
    const product = get("Description") || get("Symbol");

    return {
      isin,
      product,
      date: isoDate,
      type,
      quantity,
      pricePerUnit: tradePrice,
      currency,
      totalLocal,
      totalEUR,
      feesEUR,
      fxRate,
      feesFxRate,
      feesCurrency,
    };
  }

  /**
   * Parse one `Dividends` `Data` row into an income candidate, or return
   * `undefined` if it must be skipped (blank ISIN, with a warning pushed).
   */
  private parseDividendsRow(
    row: string[],
    colIndex: Record<string, number>,
    rowCounter: number,
  ): IBKRIncomeCandidate | undefined {
    const get = (col: string): string => {
      const idx = colIndex[col];
      return idx === undefined ? "" : (row[idx] ?? "").trim();
    };

    const isin = get("ISIN");
    if (!isin) {
      this._warningEntries.push({
        code: "MISSING_ISIN",
        row: rowCounter,
        section: "Dividends",
      });
      return undefined;
    }

    const currency = get("CurrencyPrimary");
    const isoDate = ibkrDate(get("Date"));
    const rawAmount = parseNumericField(get("Amount"));
    const amount = Math.abs(isNaN(rawAmount) ? 0 : rawAmount);
    const product = get("Description") || get("Symbol");

    return {
      isin,
      product,
      date: isoDate,
      incomeType: "dividend",
      amount,
      currency,
      row: rowCounter,
      section: "Dividends",
    };
  }

  /**
   * Parse one `Withholding Tax` `Data` row into a withholding candidate.
   * ISIN is not validated here — a blank ISIN simply fails to match any
   * income row's key downstream and surfaces as the same
   * `UNMATCHED_WITHHOLDING` orphan warning every other unmatched row gets.
   */
  private parseWithholdingRow(
    row: string[],
    colIndex: Record<string, number>,
    rowCounter: number,
  ): IBKRWithholdingCandidate {
    const get = (col: string): string => {
      const idx = colIndex[col];
      return idx === undefined ? "" : (row[idx] ?? "").trim();
    };

    const isin = get("ISIN");
    const currency = get("CurrencyPrimary");
    const isoDate = ibkrDate(get("Date"));
    const rawAmount = parseNumericField(get("Amount"));
    const amount = Math.abs(isNaN(rawAmount) ? 0 : rawAmount);

    return { isin, date: isoDate, currency, amount, row: rowCounter };
  }

  /**
   * Parse one `Interest` `Data` row into an income candidate, or return
   * `undefined` if the row is out of scope entirely (`Type` doesn't contain
   * "Bond" or `Amount` isn't positive — no warning, per spec) or has a blank
   * ISIN (warning pushed, only reached once the scope filter passes).
   */
  private parseInterestRow(
    row: string[],
    colIndex: Record<string, number>,
    rowCounter: number,
  ): IBKRIncomeCandidate | undefined {
    const get = (col: string): string => {
      const idx = colIndex[col];
      return idx === undefined ? "" : (row[idx] ?? "").trim();
    };

    const type = get("Type");
    const rawAmount = parseNumericField(get("Amount"));
    const amount = isNaN(rawAmount) ? 0 : rawAmount;

    if (!type.toUpperCase().includes("BOND") || amount <= 0) {
      return undefined;
    }

    const isin = get("ISIN");
    if (!isin) {
      this._warningEntries.push({
        code: "MISSING_ISIN",
        row: rowCounter,
        section: "Interest",
      });
      return undefined;
    }

    const currency = get("CurrencyPrimary");
    const isoDate = ibkrDate(get("Date"));
    const product = get("Description") || get("Symbol");

    return {
      isin,
      product,
      date: isoDate,
      incomeType: "coupon",
      amount,
      currency,
      row: rowCounter,
      section: "Interest",
    };
  }

  get warnings(): string[] {
    return this._warningEntries.map(warningToEnglish);
  }

  get warningEntries(): WarningEntry[] {
    return this._warningEntries;
  }

  get incomeRows(): IncomeRow[] {
    return this._incomeRows;
  }
}
