export { DEGIROParser } from "./parser/index.js";
export { Calculator } from "./calculator/index.js";
export { ParseError, CalculationError } from "./errors.js";
export type {
  Transaction,
  MatchedLot,
  GainsReport,
  LotMethod,
} from "./types.js";

// v0.6.0 value exports
export { Classifier } from "./classifier/index.js";
export { ClassificationError } from "./errors.js";

// v0.6.0 type exports
export type {
  AssetClass,
  ClassificationEntry,
  ClassificationMap,
  BucketAGroup,
  BucketAReport,
  BucketBReport,
  CarryForward,
  CalculatorOptions,
} from "./types.js";

// v0.7.0 type exports
export type {
  IncomeRow,
  CarryForwardEntry,
  DividendEntry,
  CedolaEntry,
  QuadroRTReport,
  QuadroRMReport,
  DichiarazioneReport,
} from "./types.js";
