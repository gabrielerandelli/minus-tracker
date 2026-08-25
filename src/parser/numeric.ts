/**
 * Parse a numeric CSV cell that may carry thousands-separator grouping
 * commas (e.g. `"2,500"` or `"-22,750.00"`) — something spreadsheet software
 * (Excel/Numbers/Google Sheets) commonly produces when it re-saves a CSV with
 * a number-formatted column, or that a user applies by hand. By the time this
 * runs, the CSV tokenizer (see src/parser/csv.ts) has already stripped any
 * surrounding quotes, so a cell like `"2,500"` arrives here as the bare
 * string `2,500`.
 *
 * A bare `parseFloat` is unsafe here: it parses only a leading numeric
 * prefix and silently stops at the first character it can't parse
 * (including a comma), so `parseFloat("2,500")` === 2, not 2500 — a silent,
 * potentially 1000x+ quantity/amount corruption with no error or warning.
 *
 * This validates the *entire* trimmed cell against a strict pattern before
 * ever calling `parseFloat`:
 *   - a plain signed integer/decimal with no separators, e.g. "500", "-30.00"
 *   - a properly 3-digit-grouped thousands-comma number, e.g. "2,500",
 *     "-22,750.00", "1,000,000.5"
 * Anything else — blank, "abc", or a malformed grouping like "1,2,3" or
 * "2,50" (not a genuine 3-digit group) — returns `NaN`, exactly as a
 * non-numeric cell always did with a bare `parseFloat`. Every existing
 * NaN-driven skip+warning branch (QUANTITY_ZERO, MISSING_ISIN_INCOME, "" ->
 * 0 fallbacks, etc.) therefore keeps working unchanged — this fix only
 * teaches the parser a new *valid* shape, it never accepts anything that
 * used to be (correctly) rejected.
 */
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;
const GROUPED_NUMBER = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;

export function parseNumericField(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") return NaN;
  if (PLAIN_NUMBER.test(trimmed)) {
    return parseFloat(trimmed);
  }
  if (GROUPED_NUMBER.test(trimmed)) {
    return parseFloat(trimmed.replace(/,/g, ""));
  }
  return NaN;
}
