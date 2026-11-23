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
  amount: number; // signed, in source currency — see parseWithholdingRow
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
   * rate within 5 calendar days (see lookupRate's MAX_LOOKBACK_DAYS in
   * src/rates/index.ts) are skipped silently. Inspect `parser.warnings`
   * for details.
   *
   * If the same ISIN appears across more than one distinct AssetCategory
   * value in the Trades section (e.g. a stock's own rows and an option/future
   * row sharing the underlying's ISIN — real-world exports sometimes
   * populate an option's ISIN with the underlying's for linkage), only the
   * dominant AssetCategory for that isin (the one with the most Data rows;
   * ties broken by first-encountered-in-file) is kept — the rest are
   * excluded, with a `MIXED_ASSET_CATEGORY_ISIN` warning. This avoids
   * silently cross-matching unrelated instruments in `Calculator`'s
   * isin-keyed lot matching.
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
    // Trades `Data` rows are collected here, not parsed immediately — actual
    // Transaction building is deferred until after the full file has been
    // scanned, so the same-ISIN/mixed-AssetCategory check below (which needs
    // to see every Trades row before deciding anything) can run first. See
    // "MIXED_ASSET_CATEGORY_ISIN" below.
    const tradesDataRows: { row: string[]; rowCounter: number }[] = [];

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
          tradesDataRows.push({ row, rowCounter });
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

    const getTradesCell = (row: string[], col: string): string => {
      const idx = tradesColIndex[col];
      return idx === undefined ? "" : (row[idx] ?? "").trim();
    };

    // --- Detect an ISIN shared across more than one distinct AssetCategory ---
    // Calculator keys lot-matching purely on isin (see this method's doc
    // comment above), so an isin that spans e.g. a STK row and an OPT row
    // would otherwise be silently cross-matched as if 1 contract == 1 share.
    // Counted over the same scope parseTradesRow itself would otherwise
    // accept (DataDiscriminator "Order", AssetCategory !== "CASH", non-blank
    // ISIN) — a row this loose scan wouldn't count was never going to become
    // a Transaction anyway, so it can't be party to a real cross-match.
    interface CategoryCount {
      count: number;
    }
    const categoryCountsByIsin = new Map<string, Map<string, CategoryCount>>();
    for (const { row } of tradesDataRows) {
      const discriminator = getTradesCell(row, "DataDiscriminator");
      const assetCategory = getTradesCell(row, "AssetCategory");
      const isin = getTradesCell(row, "ISIN");
      if (discriminator !== "Order" || assetCategory === "CASH" || !isin) {
        continue;
      }
      let catCounts = categoryCountsByIsin.get(isin);
      if (!catCounts) {
        catCounts = new Map();
        categoryCountsByIsin.set(isin, catCounts);
      }
      const existing = catCounts.get(assetCategory);
      if (existing) {
        existing.count++;
      } else {
        catCounts.set(assetCategory, { count: 1 });
      }
    }

    // isin -> AssetCategory to keep; only populated for isins with a real
    // conflict (more than one distinct AssetCategory value seen).
    const dominantCategoryByIsin = new Map<string, string>();
    for (const [isin, catCounts] of categoryCountsByIsin) {
      if (catCounts.size <= 1) continue;

      // catCounts iterates in first-encountered order (insertion order), so
      // a strict `>` here already implements the documented tie-break
      // ("first AssetCategory encountered in the file wins"): a later
      // category can only displace the current leader by having strictly
      // more rows, never by tying it.
      let dominantCategory: string | undefined;
      let dominantCount = -1;
      for (const [category, { count }] of catCounts) {
        if (count > dominantCount) {
          dominantCategory = category;
          dominantCount = count;
        }
      }

      dominantCategoryByIsin.set(isin, dominantCategory!);
      for (const [category, { count }] of catCounts) {
        if (category === dominantCategory) continue;
        this._warningEntries.push({
          code: "MIXED_ASSET_CATEGORY_ISIN",
          isin,
          keptCategory: dominantCategory!,
          droppedCategory: category,
          keptRows: dominantCount,
          droppedRows: count,
          section: "Trades",
        });
      }
    }

    // --- Build Transactions, excluding minority-AssetCategory rows ---
    for (const { row, rowCounter } of tradesDataRows) {
      const isin = getTradesCell(row, "ISIN");
      const assetCategory = getTradesCell(row, "AssetCategory");
      const dominantCategory = dominantCategoryByIsin.get(isin);
      if (dominantCategory !== undefined && assetCategory !== dominantCategory) {
        // Already warned about via MIXED_ASSET_CATEGORY_ISIN above (once per
        // isin/dropped-category pair, not once per row) — silently excluded
        // from Transaction[] here.
        continue;
      }
      const tx = this.parseTradesRow(row, tradesColIndex, rowCounter, snapshot);
      if (tx) transactions.push(tx);
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

    // amountEUR is signed (see parseWithholdingRow): a charge is negative, a
    // same-key reversal/correction is positive, so summing nets them exactly
    // against each other instead of doubling. The raw per-key sum is still a
    // signed net cash flow at this point (negative = net tax withheld), so it
    // is converted to a non-negative credit below, right before use.
    const totalsByKey = new Map<string, number>();
    for (const cw of convertedWithholding) {
      totalsByKey.set(cw.key, (totalsByKey.get(cw.key) ?? 0) + cw.amountEUR);
    }
    for (const [key, netAmount] of totalsByKey) {
      // A negative net (more charged than reversed) is the real tax credit;
      // a zero or positive net (fully/over reversed) means no net tax was
      // ultimately withheld, so the credit floors at 0 rather than going
      // negative.
      totalsByKey.set(key, Math.max(0, -netAmount));
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
    // Validate at the type boundary: "Buy/Sell" is raw untyped CSV text, and
    // the Transaction.type union ("BUY" | "SELL") is closed downstream (the
    // Calculator's lot-matching loop treats anything !== "BUY" as a SELL, so
    // an uncaught bad value here would silently masquerade as the opposite
    // side of a trade). Narrowing via this equality check — rather than an
    // `as` cast — makes it a compile-time error for any code below this
    // point to see `type` as anything but the literal union; no value other
    // than exactly "BUY" or "SELL" can reach the Transaction we build below.
    const rawType = get("Buy/Sell");
    if (rawType !== "BUY" && rawType !== "SELL") {
      this._warningEntries.push({
        code: "INVALID_BUY_SELL",
        row: rowCounter,
        value: rawType,
        section: "Trades",
      });
      return undefined;
    }
    const type = rawType;
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

    // A strictly negative TradePrice is real market history (e.g. CME WTI
    // crude oil futures settled at -$37.63/barrel on 2020-04-20) but breaks
    // the Transaction.totalLocal/totalEUR sign contract documented in
    // types.ts: totalEUR is always forced non-negative via Math.abs() below,
    // so a SELL executed at a negative price would be silently treated as
    // proceeds received instead of the economic loss it actually represents
    // (the seller must pay to close the position). Rather than inventing new
    // signed cost-basis/proceeds math for negative-price derivative
    // settlements — untested against any Agenzia Entrate FAQ case — skip the
    // row like the other not-safely-interpretable cases above. A TradePrice
    // of exactly 0 is unaffected (e.g. a worthless expired option).
    if (tradePrice < 0) {
      this._warningEntries.push({
        code: "NEGATIVE_TRADE_PRICE",
        row: rowCounter,
        section: "Trades",
      });
      return undefined;
    }

    // --- Multiplier (optional column) ---
    // For instruments quoted per underlying unit (options: per-share
    // premium; futures: per-unit price), TradePrice alone understates the
    // real cash value of the trade by the contract's Multiplier (e.g. 100
    // for a standard equity option). Missing column, a blank cell,
    // non-numeric garbage, zero, or a negative value are all defensive
    // fallbacks to 1 (today's behavior for plain-stock rows) rather than a
    // hard error — most real exports (plain STK) omit this column entirely.
    const rawMultiplier = parseNumericField(get("Multiplier"));
    const multiplier =
      isNaN(rawMultiplier) || rawMultiplier <= 0 ? 1 : rawMultiplier;

    // --- Bond price-as-percent-of-par ---
    // Unlike a stock (quoted as an absolute cash price per share) or an
    // option/future (absolute price per underlying unit, scaled by
    // Multiplier above), a BOND's TradePrice is universally quoted as a
    // PERCENTAGE OF FACE/PAR VALUE (e.g. TradePrice=98 means "98% of par"),
    // and Quantity is the face/par value of the position, not a share
    // count. Treating TradePrice as an absolute per-unit price for bonds
    // (the pre-fix behavior) overstates the cash value of the trade by
    // ~100x. This mirrors IBKR's own documented "bond trade value" factor
    // and is a universal fixed-income convention, not broker-specific
    // guesswork — see docs/csv-formats.md for details and a worked example.
    const isBond = assetCategory.toUpperCase() === "BOND";
    const effectiveUnitPrice = isBond ? tradePrice / 100 : tradePrice;

    const totalLocal =
      (type === "SELL" ? 1 : -1) * quantity * multiplier * effectiveUnitPrice;
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
    } else {
      // A blank IBCommissionCurrency cell is a data-quality gap in a
      // secondary field, not the same thing as a populated-but-unrecognized
      // currency code — don't discard an otherwise-valid trade over it.
      // Assume the commission is in the trade's own (already-resolved)
      // currency and flag the assumption instead of dropping the row.
      let effectiveCommissionCurrency = commissionCurrency;
      if (commissionCurrency === "") {
        effectiveCommissionCurrency = currency;
        this._warningEntries.push({
          code: "FEE_CURRENCY_ASSUMED",
          row: rowCounter,
          currency,
          section: "Trades",
        });
      }

      if (effectiveCommissionCurrency === "EUR") {
        feesEUR = Math.abs(commissionNum);
      } else {
        const commissionRate = lookupRate(
          effectiveCommissionCurrency,
          isoDate,
          snapshot,
        );
        if (commissionRate === null) {
          this._warningEntries.push({
            code: "NO_ECB_RATE",
            row: rowCounter,
            currency: effectiveCommissionCurrency,
            date: isoDate,
            section: "Trades",
          });
          return undefined;
        }
        feesEUR = Math.abs(commissionNum) / commissionRate;
        if (effectiveCommissionCurrency !== currency) {
          feesFxRate = commissionRate;
          feesCurrency = effectiveCommissionCurrency;
        }
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
      sourceRow: rowCounter,
    };
  }

  /**
   * Parse one `Dividends` `Data` row into an income candidate, or return
   * `undefined` if the row is out of scope entirely (`Amount` isn't
   * positive — no warning, per spec, mirroring `parseInterestRow`'s
   * `amount <= 0` scope filter) or has a blank ISIN (warning pushed, only
   * reached once the scope filter passes).
   *
   * A non-positive `Amount` here is not a parse error: real IBKR exports can
   * contain a `Dividends` row with a *negative* `Amount` when a previously
   * paid dividend is reversed or reclassified (e.g. as return-of-capital).
   * Taking `Math.abs()` of that reversal would turn it into a second,
   * fabricated positive dividend — silently doubling/inflating the income
   * that lands in the Quadro RM dichiarazione export. `IncomeRow` has no
   * concept of a negative/offsetting entry in this release, so (as with
   * `DEGIROParser`'s `isIncomeKeyword && localValue > 0` guard for the
   * structurally identical DEGIRO case) the correct, tax-safe behavior is to
   * exclude the row from `IncomeRow` scope entirely rather than report it —
   * under-reporting nothing, since the original row it reverses is still
   * reported as-is; this is not a cost-basis/netting adjustment. A netting
   * approach was considered and rejected: grouping by (ISIN, currency) to
   * offset a reversal against the specific payment it reverses would also
   * smear its effect across *every other, unrelated* dividend payment for
   * the same instrument/currency in the file (e.g. a stock paying quarterly
   * dividends, where only one quarter's payment is ever reversed) — those
   * unrelated, never-reversed payments would be silently rescaled away from
   * their real, broker-reported amounts, replacing one correctness bug with
   * a worse one that also corrupts otherwise-correct data.
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

    const rawAmount = parseNumericField(get("Amount"));
    const amount = isNaN(rawAmount) ? 0 : rawAmount;
    if (amount <= 0) {
      return undefined;
    }

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
   *
   * `amount` is kept **signed** here (not `Math.abs()`'d) on purpose. A real
   * IBKR export reports a genuine withholding charge as a NEGATIVE `Amount`
   * (cash outflow). A correction/reversal row undoing a previously reported
   * charge is reported with the OPPOSITE sign — i.e. positive, since it
   * undoes a negative — and it shares the SAME `(ISIN, Date,
   * CurrencyPrimary)` key as the charge it reverses, which is the realistic
   * shape of a Withholding Tax correction (contrast this with
   * `parseDividendsRow`'s reversal above, which is realistically posted on a
   * *later* date and so does not share its own row's join key — that is why
   * that fix excludes the row instead of netting it).
   *
   * Taking `Math.abs()` per-row here, before the `totalsByKey` aggregation a
   * few lines above in `parse()`, would turn a charge/reversal pair that
   * should cancel to (near) zero into two same-sign amounts that *sum*
   * instead — silently doubling the foreign tax credit reported for that
   * dividend in the Quadro RM dichiarazione export. Keeping the sign through
   * FX conversion and letting `totalsByKey` sum the raw signed amounts nets a
   * same-key reversal against its exact charge correctly, with no risk of
   * smearing that reversal onto any *other* key (date is already part of the
   * key). The final per-key total is turned back into a non-negative credit
   * (`Math.max(0, -total)`) right after the aggregation above, since a net
   * cash *inflow* for a key (an over-correction) means no net tax was
   * ultimately withheld, not a negative credit.
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
    const amount = isNaN(rawAmount) ? 0 : rawAmount;

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
