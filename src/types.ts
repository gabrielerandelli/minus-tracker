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
  carryForwardRemaining: number;
  netResult: number;
}

export interface CarryForward {
  year: number;
  amount: number;
}

export interface CalculatorOptions {
  classification?: ClassificationMap;
  carryForward?: CarryForward[];
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
}
