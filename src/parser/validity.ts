import { parseCSV } from "./csv.js";
import { stripBom } from "./bom.js";

// Cheap binary-garbage detector: a high ratio of control characters
// (charCode < 32, excluding tab) in the header-row candidate means the
// content isn't text/CSV at all, even without a NUL byte. Accented
// characters (é, à, ...) are charCode >= 128, well above this range, so
// legitimate product names never trip it.
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

export interface CsvValidity {
  /** `false` when `csv` is binary garbage / not parseable text at all. */
  valid: boolean;
  /**
   * The BOM-stripped, CSV-parsed rows, ready for a parser to consume.
   * Empty when `valid` is `false`.
   */
  rows: string[][];
}

/**
 * Structural "is this even CSV" check, shared by `DEGIROParser.parse()`,
 * `IBKRParser.parse()`, and the CLI's `calc`/`validate` broker-detection
 * fallback (`src/cli/commands/calc.ts`, `src/cli/commands/validate.ts`).
 *
 * This answers a narrower question than "is this a recognized broker
 * format" — it only rules out content that isn't parseable CSV/text at all
 * (binary garbage, NUL bytes, a garbled header, zero rows). Well-formed CSV
 * that simply isn't DEGIRO or IBKR shaped is still `valid: true` here; that
 * case is `detectBroker() === null`, handled separately by callers.
 */
export function checkCsvValidity(csv: string): CsvValidity {
  if (typeof csv !== "string") {
    return { valid: false, rows: [] };
  }

  const stripped = stripBom(csv);
  if (stripped.includes("\x00")) {
    return { valid: false, rows: [] };
  }

  const firstLine = stripped.split("\n", 1)[0] ?? "";
  if (looksLikeBinaryGarbage(firstLine)) {
    return { valid: false, rows: [] };
  }

  let rows: string[][];
  try {
    rows = parseCSV(stripped);
  } catch {
    return { valid: false, rows: [] };
  }

  if (rows.length === 0) {
    return { valid: false, rows: [] };
  }

  return { valid: true, rows };
}
