import type { LocaleStrings } from "./types.js";

export const en: LocaleStrings = {
  numberLocale: "en-US",

  bannerTagline: "Italian Capital Gains & Losses Tracker",

  errorInvalidCsv: "Invalid CSV: unable to parse",
  errorMissingColumn: (col) => `Missing required column: ${col}`,
  errorMissingSection: (sectionName) =>
    `Missing required section: ${sectionName}`,
  errorNoOpenLots: (isin, date) => `No open lots for ISIN ${isin} on ${date}`,
  errorCannotReadFile: (path) => `Cannot read file: ${path}`,
  errorCannotLoadSidecar: (path) => `Cannot load sidecar: ${path}`,
  errorCannotWriteExport: (path) =>
    `Cannot write dichiarazione export: ${path}`,
  errorBrokerDetectionFailed:
    "Unable to detect broker format. Use --broker <degiro|ibkr> to specify explicitly.",

  warnMissingIsin: (row, section) =>
    section
      ? `${section} row ${row}: missing ISIN — skipped`
      : `Row ${row}: missing ISIN — skipped`,
  warnUnsupportedCurrency: (row, currency, section) =>
    section
      ? `${section} row ${row}: unsupported currency ${currency} — skipped`
      : `Row ${row}: unsupported currency ${currency} — skipped`,
  warnNoEcbRate: (row, currency, date, section) =>
    section
      ? `${section} row ${row}: no ECB rate for ${currency} on ${date} — skipped`
      : `Row ${row}: no ECB rate for ${currency} on ${date} — skipped`,
  warnQuantityZero: (row) => `Row ${row}: quantity is 0 — skipped`,
  warnMissingIsinIncome: (row) =>
    `Row ${row}: income row has blank ISIN — skipped`,
  warnOrphanWithholding: (isin, date) =>
    `Withholding row on ${isin}/${date} has no matching income row — skipped`,
  warnUnmatchedWithholding: (row, section) =>
    section
      ? `${section} row ${row}: withholding tax with no matching income row — skipped`
      : `Row ${row}: withholding tax with no matching income row — skipped`,

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

  classifyWritten: (path) => `Written: ${path}`,
  classifyMergePrompt: (existing) =>
    `File already exists (${existing} confirmed ISINs). Add new ISINs? [Y/n]: `,
  classifyOfflineWarning: "Offline mode: OpenFIGI lookup skipped.",
  classifyUnknownType: (type) =>
    `Unrecognized type: ${type}. Please classify manually.`,
  classifyNonTtyError:
    "Interactive mode requires a TTY. Use --offline to classify without a terminal.",
  autoClassifyOfflineNotice:
    "No classification sidecar found — classifying offline automatically (no terminal detected). Run 'minus-tracker classify <file>' later to confirm via OpenFIGI.",

  bucketAHeader: "BUCKET A — CAPITAL INCOME (non-offsettable)",
  bucketBHeader: "BUCKET B — MISCELLANEOUS INCOME",
  bucketAEtf: "ETF (OICR)",
  bucketABtpWl: "Govt Bond WL",
  bucketATotalTax: "TOTAL TAX",
  bucketBCarryApplied: (year) => `CARRY ${year}`,
  bucketBResult: "RESULT",
  bucketBCarryNote: "(carriable over the next 4 years)",
  warnMixedBuckets: "Bucket B losses do not offset Bucket A plusvalenze.",
  warnMixedAssets:
    "WARNING: CSV contains mixed instrument types (e.g. ETFs + Stocks).\n" +
    "   Single-bucket calculation may not be fiscally correct.\n" +
    "   Run: minus-tracker classify trades.csv",
  headerBucket: "BUCKET",
  warnUnclassifiedIsin: (isin) =>
    `ISIN ${isin} not found in classification map — assigned to Bucket B.`,
  carryForwardInvalidFormat:
    "Invalid --carry-forward format. Use: YYYY:amount (e.g. 2023:2500)",

  disclaimer: "minus-tracker è un ausilio al calcolo, non consulenza fiscale.",

  // v0.7.0 dichiarazione section
  dichiarazioneHeader: (anno) => `── MODELLO REDDITI PF [TAX YEAR: ${anno}]`,
  dichiarazioneNota:
    "Note: row codes are indicative — verify against the official tax form.",
  dichiarazioneWarningRow:
    "⚠  Row codes in square brackets are indicative. Check the current form version.",
  quadroRTHeader: "QUADRO RT — SECTION II (capital gains)",
  quadroRTPlusvalenze: "[RT-P]  Total gains",
  quadroRTMinusvalenze: "[RT-M]  Total losses",
  quadroRTDifferenza: "[RT-D]  Difference",
  quadroRTRiporto: (anno) => `[RT-C*] Prior loss ${anno} (applied)`,
  quadroRTImponibile: "[RT-N]  Net taxable",
  quadroRTImposta: "[RT-I]  Tax (26%)",
  quadroRTRiportabile: "[RT-R]  Losses to carry forward",
  quadroRTPerdita: "net loss:",
  quadroRMHeader: "QUADRO RM (capital income)",
  quadroRMEtf26: "[RM-A1] ETF/OICR gains (26%)",
  quadroRMImposta: "Substitute tax",
  quadroRMBtp: "[RM-A2] BTP/WL gains (12.5%)",
  quadroRMDividendi: "[RM-D]  Foreign dividends (gross)",
  quadroRMRitenuta: "Foreign withholding (credit)",
  quadroRMCedole: "[RM-C]  Bond coupons",
  dichiarazioneDisclaimer:
    "minus-tracker è un ausilio al calcolo, non consulenza fiscale.",
  warnNoCarryForwardProvided: "(prior-year losses not applied)",
};
