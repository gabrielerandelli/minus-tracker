# Part 2 — Public API

## Entry points

```ts
import { DEGIROParser, Calculator } from "minus-tracker";

const transactions = new DEGIROParser().parse(csvString);
const report = new Calculator(transactions).calculateGains("LIFO"); // or "FIFO"
```

These two imports are the **public contract**. Do not break them.

## Core types

```ts
type LotMethod = "LIFO" | "FIFO";

interface Transaction {
  isin: string;
  product: string; // display name
  date: string; // ISO date (YYYY-MM-DD)
  type: "BUY" | "SELL";
  quantity: number; // always positive
  pricePerUnit: number; // in original currency
  currency: string; // ISO 4217 (EUR, USD, GBP, CHF)
  totalLocal: number; // signed: negative for BUY (cash outflow), positive for SELL (cash inflow), in original currency
  totalEUR: number; // |totalLocal| / ecbRate — always positive; converted at ECB rate on trade date
  feesEUR: number; // brokerage costs in EUR, always positive
  fxRate?: number; // ECB rate used (undefined if currency === EUR)
}

interface MatchedLot {
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
}

interface GainsReport {
  method: LotMethod;
  taxYear: number; // inferred from transaction dates (see Part 6)
  plusvalenze: number; // EUR, sum of positive gainLossEUR, rounded to 2dp
  minusvalenze: number; // EUR, sum of |negative gainLossEUR|, rounded to 2dp
  netResult: number; // plusvalenze - minusvalenze, rounded to 2dp
  lots: MatchedLot[];
  ratesUsed: Record<string, number>; // key: "USD:2023-03-01", value: 1.094
  warnings: string[]; // parse-time warnings (from DEGIROParser) + calc-time warnings
  generatedAt: string; // ISO timestamp
}
```

## DEGIROParser

```ts
class DEGIROParser {
  parse(csv: string): Transaction[];
  // Throws ParseError on structural failures.
  // Skips unrecognised rows; messages available via the warnings getter below.

  get warnings(): string[];
  // Read after calling parse(). Contains one entry per skipped row.
  // Empty until parse() has been called.
}
```

Pass `parser.warnings` into the `Calculator` constructor so they surface in `GainsReport.warnings`.

## Calculator

```ts
class Calculator {
  constructor(transactions: Transaction[], parseWarnings?: string[]);
  // parseWarnings: pass DEGIROParser.warnings here; they are merged into GainsReport.warnings.
  calculateGains(method: LotMethod): GainsReport;
  // Throws CalculationError if SELL has no matching BUY lots.
}
```

Typical usage:

```ts
const parser = new DEGIROParser();
const transactions = parser.parse(csvString);
const report = new Calculator(transactions, parser.warnings).calculateGains(
  "LIFO",
);
// report.warnings contains both parse-time and calc-time warnings
```

## Errors

```ts
class ParseError extends Error {}
class CalculationError extends Error {}
```

## Module exports

```ts
export { DEGIROParser, Calculator, ParseError, CalculationError };
export type { Transaction, MatchedLot, GainsReport, LotMethod };
```
