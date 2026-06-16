import { Transaction } from "../types.js";
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

export class DEGIROParser {
  private _warningEntries: WarningEntry[] = [];
  private _snapshot?: RatesSnapshot;

  constructor(snapshot?: RatesSnapshot) {
    this._snapshot = snapshot;
  }

  parse(csv: string): Transaction[] {
    this._warningEntries = [];

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

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      // 1-indexed row number: header = 1, first data row = 2
      const rowIndex = r + 1;

      // Skip completely empty rows (including the trailing empty line after a
      // final newline, and rows that are all whitespace)
      if (row.every((cell) => cell.trim() === "")) continue;

      const get = (col: string): string => (row[colIndex[col]] ?? "").trim();

      // --- ISIN ---
      const isin = get("ISIN");
      if (!isin) {
        this._warningEntries.push({ code: "MISSING_ISIN", row: rowIndex });
        continue;
      }

      // --- Quantity ---
      const rawQty = parseFloat(get("Quantity"));
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
      const product = get("Product");

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

    return transactions;
  }

  get warnings(): string[] {
    return this._warningEntries.map(warningToEnglish);
  }

  get warningEntries(): WarningEntry[] {
    return this._warningEntries;
  }
}
