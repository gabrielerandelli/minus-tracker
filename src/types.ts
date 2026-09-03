export type LotMethod = "LIFO" | "FIFO";

export type AssetClass =
  | "ETF"
  | "Stock"
  | "ETC"
  | "GovtBondWL"
  | "GovtBondOther"
  | "CorpBond"
  | "Derivative"
  | "LeverageCert"
  | "CapProtectedCert";

export interface ClassificationEntry {
  product: string;
  assetClass: AssetClass;
  bucketGain: "A" | "B";
  bucketLoss: "A" | "B";
  taxRate: number;
  whiteListed: boolean | null;
  confirmedByUser: boolean;
  source: "openfigi" | "user";
}

export type ClassificationMap = Record<string, ClassificationEntry>;

export interface BucketAGroup {
  taxRate: number;
  assetClasses: AssetClass[];
  plusvalenze: number;
  imposta: number;
}

export interface BucketAReport {
  groups: BucketAGroup[];
  totalImposta: number;
}

export interface BucketBReport {
  plusvalenze: number;
  minusvalenze: number;
  carryForwardApplied: number;
  /**
   * This year's Bucket B loss not covered by the supplied `carryForward`
   * entries (i.e. `Math.max(0, -netResult)`) — NOT the unused balance of
   * past `carryForward` entries. For the per-entry unused balance still
   * available for future years, see `carryForwardEntriesRemaining`.
   */
  carryForwardRemaining: number;
  /**
   * Per supplied `carryForward` entry, how much of its original `amount` was
   * NOT consumed this year and is still within its 4-year carry window —
   * i.e. what a caller should feed back in as `carryForward` for next year's
   * calculation. Entries already past the 4-year cutoff are omitted (they
   * were never eligible to be applied, so they're expired, not "remaining").
   */
  carryForwardEntriesRemaining: CarryForwardEntry[];
  netResult: number;
}

export interface CarryForward {
  year: number;
  amount: number;
}

export interface IncomeRow {
  isin: string;
  product: string;
  date: string; // ISO date YYYY-MM-DD
  incomeType: "dividend" | "coupon";
  grossAmount: number; // EUR
  withholdingTax: number; // EUR, always >= 0
  currency: string; // ISO 4217 of source row
  fxRate?: number; // ECB rate used; undefined if currency === "EUR"
}

export interface CarryForwardEntry {
  annoOrigine: number;
  importo: number;
}

export interface DividendEntry {
  isin: string;
  prodotto: string;
  lordo: number;
  rittenutaEstera: number;
}

export interface CedolaEntry {
  isin: string;
  prodotto: string;
  importo: number;
  rittenutaEstera: number;
}

export interface QuadroRTReport {
  plusvalenze: number;
  minusvalenze: number;
  differenza: number;
  carryForwardApplied: CarryForwardEntry[];
  imponibileNetto: number;
  imposta: number;
  carryForwardRiportato: CarryForwardEntry[];
}

export interface QuadroRMReport {
  capitaleAliquota26: { plusvalenze: number; imposta: number };
  capitaleAliquota125: { plusvalenze: number; imposta: number };
  dividendiEsteri: DividendEntry[];
  cedole: CedolaEntry[];
}

export interface DichiarazioneReport {
  version: number;
  annoImposta: number;
  modello: "Redditi PF";
  generatedAt: string;
  quadroRT: QuadroRTReport;
  quadroRM: QuadroRMReport;
  exportTo(path: string): Promise<void>;
}

export interface CalculatorOptions {
  classification?: ClassificationMap;
  carryForward?: CarryForward[];
  incomeRows?: IncomeRow[];
  // v0.11.2 — scopes report aggregation to one tax year while lot matching
  // still runs on the full input (see Calculator.calculateGains). Omitted:
  // taxYear is inferred from SELL transaction dates as before, throwing
  // CalculationError with .code === "AMBIGUOUS_TAX_YEAR" if they span more
  // than one calendar year.
  taxYear?: number;
}

/**
 * Options for `Classifier.classify()`'s stateless mode (v0.8.0).
 * Internal — not re-exported from the public `src/index.ts` barrel.
 */
export interface ClassifyOptions {
  existingClassification?: ClassificationMap;
  overrides?: Record<string, AssetClass>;
  offline?: boolean;
  onBatchProgress?: (done: number, total: number) => void;
}

// Input shapes for the MCP server's 3 tools (v0.8.0). Internal — not
// re-exported from the public `src/index.ts` barrel. These are the single
// source of truth `scripts/generate-mcp-schemas.js` points
// `ts-json-schema-generator` at to produce each tool's `inputSchema`; adding
// a field here and regenerating must surface it with no hand-maintained
// schema to fall out of sync.

export interface ParseTransactionsInput {
  csv: string;
}

export interface ClassifyInstrumentsInput {
  transactions: Transaction[];
  existingClassification?: ClassificationMap;
  overrides?: Record<string, AssetClass>;
  offline?: boolean;
}

export interface CalculateGainsInput {
  transactions: Transaction[];
  method: LotMethod;
  parseWarnings?: string[];
  classification?: ClassificationMap;
  carryForward?: CarryForward[];
  incomeRows?: IncomeRow[];
}

export interface Transaction {
  isin: string;
  product: string;
  date: string; // ISO date YYYY-MM-DD
  type: "BUY" | "SELL";
  quantity: number; // always positive
  pricePerUnit: number; // in original currency
  currency: string; // ISO 4217
  totalLocal: number; // signed: negative for BUY, positive for SELL
  totalEUR: number; // |totalLocal| / ecbRate — always positive
  feesEUR: number; // brokerage costs in EUR, always positive
  fxRate?: number; // ECB rate used; undefined if currency === "EUR"
  // v0.11.0 — set only by IBKRParser, only when the commission currency
  // differs from both the trade currency and EUR. DEGIROParser never sets
  // these; they remain undefined there.
  feesFxRate?: number;
  feesCurrency?: string;
  // v0.11.2 — 1-indexed CSV row this transaction was parsed from (same
  // numbering as WarningEntry.row: for DEGIROParser, the raw CSV row with
  // the header counted as row 1; for IBKRParser, the Trades section's own
  // row counter, matching how its warnings are already section-relative).
  // Set by DEGIROParser/IBKRParser; used by the multi-file merge pipeline's
  // (src/cli/multi-file.ts) cross-file duplicate-row detection
  // (warnDuplicateRow's {row1}/{row2}). Optional so hand-built Transaction
  // objects (tests, MCP tool input) remain valid without it.
  sourceRow?: number;
}

export interface MatchedLot {
  isin: string;
  product: string;
  quantity: number;
  buyDate: string; // ISO date
  sellDate: string; // ISO date
  buyPriceEUR: number; // per unit
  sellPriceEUR: number; // per unit
  buyCostEUR: number; // total cost basis incl. fees
  sellProceedsEUR: number; // total proceeds minus fees
  gainLossEUR: number; // sellProceedsEUR - buyCostEUR
  buyFxRate?: number;
  sellFxRate?: number;
  bucket?: "A" | "B";
}

// v0.11.0 — implemented by both DEGIROParser and IBKRParser.
export interface Parser {
  parse(csv: string): Transaction[];
  readonly warnings: string[];
  readonly incomeRows: IncomeRow[];
}

export interface GainsReport {
  method: LotMethod;
  taxYear: number;
  plusvalenze: number; // EUR, sum of positive gainLossEUR, rounded to 2dp
  minusvalenze: number; // EUR, sum of |negative gainLossEUR|, rounded to 2dp
  netResult: number; // plusvalenze - minusvalenze, rounded to 2dp
  lots: MatchedLot[];
  ratesUsed: Record<string, number>; // key: "USD:2023-03-01", value: 1.094
  warnings: string[];
  generatedAt: string; // ISO timestamp
  bucketA?: BucketAReport;
  bucketB?: BucketBReport;
  dichiarazione?: DichiarazioneReport;
}
