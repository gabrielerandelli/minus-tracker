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
  errorCannotReadFile: (path: string) => string;
  errorCannotLoadSidecar: (path: string) => string;
  errorCannotWriteExport: (path: string) => string;

  // Soft warnings (per-row)
  warnMissingIsin: (row: number) => string;
  warnUnsupportedCurrency: (row: number, currency: string) => string;
  warnNoEcbRate: (row: number, currency: string, date: string) => string;
  warnQuantityZero: (row: number) => string;
  warnMissingIsinIncome: (row: number) => string;
  warnOrphanWithholding: (isin: string, date: string) => string;

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
  ratesAutoUpdateStart: string;
  ratesAutoUpdateFailed: string;

  // config command
  configLangSet: (lang: SupportedLocale) => string;
  configCurrentLang: (lang: SupportedLocale) => string;

  // classify command (Part 11)
  classifyWritten: (path: string) => string;
  classifyMergePrompt: (existing: number) => string;
  classifyOfflineWarning: string;
  classifyUnknownType: (type: string) => string;
  classifyNonTtyError: string;
  autoClassifyOfflineNotice: string;

  // two-bucket output (Part 12)
  bucketAHeader: string;
  bucketBHeader: string;
  bucketAEtf: string;
  bucketABtpWl: string;
  bucketATotalTax: string;
  bucketBCarryApplied: (year: number) => string;
  bucketBResult: string;
  bucketBCarryNote: string;
  warnMixedBuckets: string;
  warnMixedAssets: string;
  headerBucket: string;
  warnUnclassifiedIsin: (isin: string) => string;
  carryForwardInvalidFormat: string;

  // Legal disclaimer — always Italian
  disclaimer: string;

  // v0.7.0 dichiarazione section
  dichiarazioneHeader(anno: number): string;
  dichiarazioneNota: string;
  dichiarazioneWarningRow: string;
  quadroRTHeader: string;
  quadroRTPlusvalenze: string;
  quadroRTMinusvalenze: string;
  quadroRTDifferenza: string;
  quadroRTRiporto(anno: number): string;
  quadroRTImponibile: string;
  quadroRTImposta: string;
  quadroRTRiportabile: string;
  quadroRTPerdita: string;
  quadroRMHeader: string;
  quadroRMEtf26: string;
  quadroRMImposta: string;
  quadroRMBtp: string;
  quadroRMDividendi: string;
  quadroRMRitenuta: string;
  quadroRMCedole: string;
  dichiarazioneDisclaimer: string;
  warnNoCarryForwardProvided: string;
}
