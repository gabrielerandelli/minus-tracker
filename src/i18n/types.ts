export type SupportedLocale = "it" | "en";

export interface MinusTrackerConfig {
  locale?: SupportedLocale;
}

export interface LocaleStrings {
  // Number formatting
  numberLocale: "it-IT" | "en-US";

  // Hard error messages
  errorInvalidCsv: string;
  errorMissingColumn: (columnName: string) => string;
  errorNoOpenLots: (isin: string, date: string) => string;

  // Soft warnings (per-row)
  warnMissingIsin: (row: number) => string;
  warnUnsupportedCurrency: (row: number, currency: string) => string;
  warnNoEcbRate: (row: number, currency: string, date: string) => string;
  warnQuantityZero: (row: number) => string;

  // calc command: multi-year warning
  warnMultipleYears: string;

  // calc command: table column headers
  headerMethod: string;
  headerTaxYear: string;
  headerIsin: string;
  headerProduct: string;
  headerQty: string;
  headerBuyDate: string;
  headerSellDate: string;
  headerBuyEur: string;
  headerSellEur: string;
  headerGainLoss: string;

  // calc command: summary block
  summaryPlusvalenze: string;
  summaryMinusvalenze: string;
  summaryNetResult: string;
  summaryWarnings: string;
  summaryGenerated: string;

  // validate command
  validateOk: (count: number, hardErrors: number) => string;
  validateWarn: (count: number, reason: string) => string;

  // rates command
  ratesCoverage: (start: string, end: string, currencies: string) => string;
  ratesGapsNone: string;
  ratesGaps: (list: string) => string;
  ratesUpdateFetching: string;
  ratesUpdateDone: (addedCount: number) => string;
  ratesSnapshotWritten: (filePath: string) => string;

  // config command
  configLangSet: (lang: SupportedLocale) => string;
  configCurrentLang: (lang: SupportedLocale) => string;

  // Legal disclaimer — always Italian
  disclaimer: string;
}
