import type { LocaleStrings } from "./types.js";

export const en: LocaleStrings = {
  numberLocale: "en-US",

  errorInvalidCsv: "Invalid CSV: unable to parse",
  errorMissingColumn: (col) => `Missing required column: ${col}`,
  errorNoOpenLots: (isin, date) => `No open lots for ISIN ${isin} on ${date}`,

  warnMissingIsin: (row) => `Row ${row}: missing ISIN — skipped`,
  warnUnsupportedCurrency: (row, currency) =>
    `Row ${row}: unsupported currency ${currency} — skipped`,
  warnNoEcbRate: (row, currency, date) =>
    `Row ${row}: no ECB rate for ${currency} on ${date} — skipped`,
  warnQuantityZero: (row) => `Row ${row}: quantity is 0 — skipped`,

  warnMultipleYears:
    "CSV contains transactions from multiple years — filter to a single year for accurate reporting.",

  headerMethod: "METHOD",
  headerTaxYear: "TAX YEAR",
  headerIsin: "ISIN",
  headerProduct: "PRODUCT",
  headerQty: "QTY",
  headerBuyDate: "BUY DATE",
  headerSellDate: "SELL DATE",
  headerBuyEur: "BUY EUR",
  headerSellEur: "SELL EUR",
  headerGainLoss: "GAIN/LOSS",

  summaryPlusvalenze: "PLUSVALENZE",
  summaryMinusvalenze: "MINUSVALENZE",
  summaryNetResult: "NET RESULT",
  summaryWarnings: "WARNINGS",
  summaryGenerated: "Generated",

  validateOk: (count, errors) =>
    `OK: ${count} transactions parsed, ${errors} hard errors`,
  validateWarn: (count, reason) => `WARN: ${count} rows skipped (${reason})`,

  ratesCoverage: (start, end, currencies) =>
    `Coverage: ${start} → ${end} | Currencies: ${currencies}`,
  ratesGapsNone: "Gaps: none",
  ratesGaps: (list) => `Gaps: ${list}`,
  ratesUpdateFetching: "Fetching ECB SDMX...",
  ratesUpdateDone: (n) => `Done. Added ${n} new dates.`,
  ratesSnapshotWritten: (path) => `Snapshot written to ${path}`,
  ratesAutoUpdateStart: "ECB rates are stale. Auto-updating…",
  ratesAutoUpdateFailed: "Auto-update failed. Proceeding with available rates.",

  configLangSet: (lang) => `Language set to: ${lang}`,
  configCurrentLang: (lang) => `Current language: ${lang}`,

  disclaimer: "minus-tracker è un ausilio al calcolo, non consulenza fiscale.",
};
