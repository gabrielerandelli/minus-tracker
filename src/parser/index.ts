import { Transaction, IncomeRow } from "../types.js";
import { ParseError } from "../errors.js";
import {
  lookupRate,
  getActiveSnapshot,
  RatesSnapshot,
} from "../rates/index.js";
import { WarningEntry, warningToEnglish } from "./warnings.js";

const REQUIRED_COLUMNS = [
  "ISIN",
  "Quantity",
  "Price",
  "Date",
  "Local value",
  "Local value currency",
  "Transaction costs",
  "Transaction costs currency",
  "Product",
] as const;

// Income-row product keyword matching (case-insensitive substring match).
// Tax keywords are checked first because "DIVIDEND TAX" also contains "DIVIDEND".
const INCOME_KEYWORDS = ["DIVIDEND", "COUPON", "INTEREST", "CEDOLA"] as const;
const TAX_KEYWORDS = ["DIVIDEND TAX", "WITHHOLDING", "RITENUTA"] as const;

// Cheap binary-garbage detector: a high ratio of control characters (charCode
// < 32, excluding tab) in the header-row candidate means the content isn't
// text/CSV at all, even without a NUL byte. Accented characters (é, à, ...)
// are charCode >= 128, well above this range, so legitimate product names
// never trip it.
const BINARY_GARBAGE_CONTROL_CHAR_RATIO = 0.1;

function looksLikeBinaryGarbage(firstLine: string): boolean {
  if (firstLine.length === 0) return false;
  let controlChars = 0;
  for (let i = 0; i < firstLine.length; i++) {
    const code = firstLine.charCodeAt(i);
    if (code < 32 && code !== 9) controlChars++;
  }
  return controlChars / firstLine.length > BINARY_GARBAGE_CONTROL_CHAR_RATIO;
}

interface IncomeCandidate {
  isin: string;
  product: string;
  date: string;
  incomeType: "dividend" | "coupon";
  localValue: number;
  currency: string;
  row: number;
}

interface WithholdingCandidate {
  isin: string;
  date: string;
  amount: number; // absolute value, in source currency
  row: number;
}

/**
 * Parse a single CSV line, respecting RFC-4180-style double-quote escaping.
 * Does not support embedded newlines in fields (not needed for DEGIRO exports).
 */
function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
  let i = 0;

  while (i <= line.length) {
    // End of line — stop (handles trailing comma by not emitting extra empty field)
    if (i === line.length) break;

    if (line[i] === '"') {
      // Quoted field
      let field = "";
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && i + 1 < line.length && line[i + 1] === '"') {
          // Escaped double-quote
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (i < line.length && line[i] === ",") i++; // skip delimiter
    } else {
      // Unquoted field
      const start = i;
      while (i < line.length && line[i] !== ",") i++;
      fields.push(line.slice(start, i));
      if (i < line.length) i++; // skip delimiter
    }
  }

  return fields;
}

/**
 * Parse a full CSV string (CRLF or LF line endings) into a 2-D array of strings.
 */
function parseCSV(input: string): string[][] {
  const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.split("\n").map(parseCSVRow);
}

/**
 * Convert a DEGIRO date "DD-MM-YYYY" to ISO format "YYYY-MM-DD".
 */
function parseDate(ddmmyyyy: string): string {
  const [dd, mm, yyyy] = ddmmyyyy.split("-");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parses a DEGIRO Transactions CSV export into normalised Transaction objects.
 *
 * Export from Activity → Transactions in the DEGIRO UI (not the Account Statement).
 * Supported currencies: EUR, USD, GBP, CHF. ECB historical rates are used for conversion.
 */
export class DEGIROParser {
  private _warningEntries: WarningEntry[] = [];
  private _snapshot?: RatesSnapshot;
  private _incomeRows: IncomeRow[] = [];

  constructor(snapshot?: RatesSnapshot) {
    this._snapshot = snapshot;
  }

  /**
   * Parse a DEGIRO Transactions CSV export string.
   *
   * @param csv - Raw UTF-8 string from the DEGIRO Transactions export.
   * @returns Array of normalised Transaction objects. Empty if no data rows are found.
   * @throws {ParseError} code `"INVALID_CSV"` — malformed CSV or binary content.
   * @throws {ParseError} code `"MISSING_COLUMN"` (+ `columnName`) — required column absent.
   *
   * Rows with missing ISIN, unsupported currency, zero quantity, or no ECB rate within
   * 3 trading days are skipped silently. Inspect `parser.warnings` for details.
   */
  parse(csv: string): Transaction[] {
    this._warningEntries = [];
    this._incomeRows = [];

    // Binary content (null bytes, or a header row dense with control
    // characters) is not valid CSV
    if (typeof csv !== "string" || csv.includes("\x00")) {
      throw new ParseError("INVALID_CSV");
    }
    const firstLine = csv.split("\n", 1)[0] ?? "";
    if (looksLikeBinaryGarbage(firstLine)) {
      throw new ParseError("INVALID_CSV");
    }

    let rows: string[][];
    try {
      rows = parseCSV(csv);
    } catch {
      throw new ParseError("INVALID_CSV");
    }

    if (rows.length === 0) {
      throw new ParseError("INVALID_CSV");
    }

    // Build column-name → index map from the header row
    const header = rows[0];
    const colIndex: Record<string, number> = {};
    for (let i = 0; i < header.length; i++) {
      colIndex[header[i].trim()] = i;
    }

    // Validate that every required column is present
    for (const col of REQUIRED_COLUMNS) {
      if (colIndex[col] === undefined) {
        throw new ParseError("MISSING_COLUMN", col);
      }
    }

    // Resolve the rates snapshot once for the whole parse run
    const snapshot: RatesSnapshot = this._snapshot ?? getActiveSnapshot();

    const transactions: Transaction[] = [];
    const incomeCandidates: IncomeCandidate[] = [];
    const withholdingCandidates: WithholdingCandidate[] = [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      // 1-indexed row number: header = 1, first data row = 2
      const rowIndex = r + 1;

      // Skip completely empty rows (including the trailing empty line after a
      // final newline, and rows that are all whitespace)
      if (row.every((cell) => cell.trim() === "")) continue;

      const get = (col: string): string => (row[colIndex[col]] ?? "").trim();

      const isin = get("ISIN");
      const product = get("Product");
      const qtyStr = get("Quantity");
      const rawQty = parseFloat(qtyStr);
      const qtyIsZeroOrBlank = qtyStr === "" || isNaN(rawQty) || rawQty === 0;

      // --- Income-row detection (Quantity == 0 or blank) ---
      if (qtyIsZeroOrBlank) {
        const upperProduct = product.toUpperCase();
        const isTaxKeyword = TAX_KEYWORDS.some((k) => upperProduct.includes(k));
        const isIncomeKeyword =
          !isTaxKeyword &&
          INCOME_KEYWORDS.some((k) => upperProduct.includes(k));

        if (isTaxKeyword || isIncomeKeyword) {
          const rawLocalValue = parseFloat(get("Local value"));
          const localValue = isNaN(rawLocalValue) ? 0 : rawLocalValue;
          const isoDate = parseDate(get("Date"));

          if (isTaxKeyword && localValue < 0) {
            if (!isin) {
              this._warningEntries.push({
                code: "MISSING_ISIN_INCOME",
                row: rowIndex,
              });
              continue;
            }
            withholdingCandidates.push({
              isin,
              date: isoDate,
              amount: Math.abs(localValue),
              row: rowIndex,
            });
            continue;
          }

          if (isIncomeKeyword && localValue > 0) {
            if (!isin) {
              this._warningEntries.push({
                code: "MISSING_ISIN_INCOME",
                row: rowIndex,
              });
              continue;
            }
            const incomeType: "dividend" | "coupon" = upperProduct.includes(
              "DIVIDEND",
            )
              ? "dividend"
              : "coupon";
            incomeCandidates.push({
              isin,
              product,
              date: isoDate,
              incomeType,
              localValue,
              currency: get("Local value currency"),
              row: rowIndex,
            });
            continue;
          }
          // Keyword matched but sign doesn't match the expected direction —
          // fall through to standard transaction handling below.
        }
      }

      // --- ISIN ---
      if (!isin) {
        this._warningEntries.push({ code: "MISSING_ISIN", row: rowIndex });
        continue;
      }

      // --- Quantity ---
      if (isNaN(rawQty) || rawQty === 0) {
        this._warningEntries.push({ code: "QUANTITY_ZERO", row: rowIndex });
        continue;
      }

      const type: "BUY" | "SELL" = rawQty > 0 ? "BUY" : "SELL";
      const quantity = Math.abs(rawQty);

      // --- Date ---
      const isoDate = parseDate(get("Date"));

      // --- Currency & FX ---
      const currency = get("Local value currency");
      const rawTotalLocal = parseFloat(get("Local value"));
      const totalLocal = isNaN(rawTotalLocal) ? 0 : rawTotalLocal;

      let totalEUR: number;
      let fxRate: number | undefined;

      if (currency === "EUR") {
        totalEUR = Math.abs(totalLocal);
        fxRate = undefined;
      } else {
        const rate = lookupRate(currency, isoDate, snapshot);
        if (rate === null) {
          if (snapshot[currency] === undefined) {
            this._warningEntries.push({
              code: "UNSUPPORTED_CURRENCY",
              row: rowIndex,
              currency,
            });
          } else {
            this._warningEntries.push({
              code: "NO_ECB_RATE",
              row: rowIndex,
              currency,
              date: isoDate,
            });
          }
          continue;
        }
        totalEUR = Math.abs(totalLocal) / rate;
        fxRate = rate;
      }

      // --- Fees ---
      const rawFees = parseFloat(get("Transaction costs"));
      const feesEUR = Math.abs(isNaN(rawFees) ? 0 : rawFees);

      // --- Remaining fields ---
      const pricePerUnit = parseFloat(get("Price"));

      transactions.push({
        isin,
        product,
        date: isoDate,
        type,
        quantity,
        pricePerUnit,
        currency,
        totalLocal,
        totalEUR,
        feesEUR,
        fxRate,
      });
    }

    // --- Pair withholding candidates with income candidates by (ISIN, date) ---
    // Order-independent: candidates were collected regardless of CSV row order.
    const withholdingByKey = new Map<
      string,
      { isin: string; date: string; amount: number }
    >();
    for (const w of withholdingCandidates) {
      const key = `${w.isin}|${w.date}`;
      const existing = withholdingByKey.get(key);
      withholdingByKey.set(key, {
        isin: w.isin,
        date: w.date,
        amount: (existing?.amount ?? 0) + w.amount,
      });
    }
    const consumedKeys = new Set<string>();

    const incomeRows: IncomeRow[] = [];
    for (const c of incomeCandidates) {
      const key = `${c.isin}|${c.date}`;
      const matchedWithholding = withholdingByKey.get(key);

      let grossAmount: number;
      let withholdingTax: number;
      let fxRate: number | undefined;

      if (c.currency === "EUR") {
        grossAmount = Math.abs(c.localValue);
        withholdingTax = matchedWithholding?.amount ?? 0;
        fxRate = undefined;
      } else {
        const rate = lookupRate(c.currency, c.date, snapshot);
        if (rate === null) {
          if (snapshot[c.currency] === undefined) {
            this._warningEntries.push({
              code: "UNSUPPORTED_CURRENCY",
              row: c.row,
              currency: c.currency,
            });
          } else {
            this._warningEntries.push({
              code: "NO_ECB_RATE",
              row: c.row,
              currency: c.currency,
              date: c.date,
            });
          }
          continue;
        }
        grossAmount = Math.abs(c.localValue) / rate;
        withholdingTax = matchedWithholding
          ? matchedWithholding.amount / rate
          : 0;
        fxRate = rate;
      }

      if (matchedWithholding) consumedKeys.add(key);

      incomeRows.push({
        isin: c.isin,
        product: c.product,
        date: c.date,
        incomeType: c.incomeType,
        grossAmount,
        withholdingTax,
        currency: c.currency,
        fxRate,
      });
    }

    // Orphan withholding candidates — no matching income row for (ISIN, date)
    for (const [key, w] of withholdingByKey) {
      if (!consumedKeys.has(key)) {
        this._warningEntries.push({
          code: "ORPHAN_WITHHOLDING",
          isin: w.isin,
          date: w.date,
        });
      }
    }

    this._incomeRows = incomeRows;

    return transactions;
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
