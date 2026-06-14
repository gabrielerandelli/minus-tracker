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
  totalLocal: number; // quantity * pricePerUnit (original currency)
  totalEUR: number; // converted at ECB rate on trade date
  feesEUR: number; // brokerage costs in EUR
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
  plusvalenze: number; // EUR, sum of positive gainLossEUR
  minusvalenze: number; // EUR, sum of |negative gainLossEUR|
  netResult: number; // plusvalenze - minusvalenze
  lots: MatchedLot[];
  ratesUsed: Record<string, number>; // key: "USD:2023-03-01", value: 1.094
  warnings: string[];
  generatedAt: string; // ISO timestamp
}
```

## DEGIROParser

```ts
class DEGIROParser {
  parse(csv: string): Transaction[];
  // Throws ParseError on structural failures.
  // Skips unrecognised rows and appends to warnings (surfaced via Calculator).
}
```

## Calculator

```ts
class Calculator {
  constructor(transactions: Transaction[]);
  calculateGains(method: LotMethod): GainsReport;
  // Throws CalculationError if SELL has no matching BUY lots.
}
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
