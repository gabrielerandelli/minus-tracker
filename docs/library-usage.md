[← Back to README](../README.md) · [All docs](README.md)

# Library Usage

## Installation

```bash
npm install @gabrielerandelli/minus-tracker
```

## Usage

```ts
import {
  DEGIROParser,
  IBKRParser,
  Calculator,
  Classifier,
  ParseError,
  CalculationError,
} from "@gabrielerandelli/minus-tracker";
import type {
  GainsReport,
  LotMethod,
  Parser,
} from "@gabrielerandelli/minus-tracker";

// 1. Parse — DEGIRO (Activity → Transactions export)
const parser = new DEGIROParser();
const transactions = parser.parse(csvString); // throws ParseError on bad CSV
if (parser.warnings.length > 0) {
  console.warn("Skipped rows:", parser.warnings);
}

// 1b. Parse — Interactive Brokers (Activity Flex Query CSV export)
// Both parsers implement the shared `Parser` interface, so they're
// interchangeable anywhere `parser` is used in this example.
const ibkrParser: Parser = new IBKRParser();
const ibkrTransactions = ibkrParser.parse(ibkrCsvString); // also throws ParseError with code MISSING_SECTION

// 2. Classify (Bucket A/B) — optional, enables Quadro RT/RM in the report
const classification = await new Classifier().classify(
  transactions,
  "trades.classify.json", // persistent sidecar; omit for stateless mode
);

// 3. Calculate
const method: LotMethod = "LIFO"; // or "FIFO"
const report: GainsReport = new Calculator(transactions, parser.warnings, {
  classification,
}).calculateGains(method);

console.log(report.plusvalenze); // EUR capital gains (number)
console.log(report.minusvalenze); // EUR capital losses (number, absolute value)
console.log(report.netResult); // plusvalenze - minusvalenze
console.log(report.lots); // MatchedLot[] — per-lot breakdown
console.log(report.dichiarazione); // Quadro RT/RM, when classification was passed

// 4. Error handling
try {
  const txs = parser.parse(csvString);
  const r = new Calculator(txs, parser.warnings).calculateGains("LIFO");
} catch (err) {
  if (err instanceof ParseError) {
    if (err.code === "MISSING_COLUMN") {
      console.error("Missing column:", err.columnName);
    } else if (err.code === "MISSING_SECTION") {
      console.error("Missing section (IBKR only):", err.sectionName);
    } else {
      console.error("Invalid CSV");
    }
  } else if (err instanceof CalculationError) {
    console.error(`SELL without prior BUY: ${err.isin} on ${err.date}`);
  }
}
```

> **Note:** `parser.warningEntries` (visible in TypeScript autocomplete) is an internal API used by the CLI renderer. Use `parser.warnings` (`string[]`) for library consumers.

minus-tracker is **pure tax math** — no UI, auth, database, or PDF.

**Prerequisites:** Node.js ≥ 24 ([nodejs.org](https://nodejs.org))

## Next steps

- [MCP Server](mcp-server.md) — expose the same calculation logic as MCP tools for AI agents

[← Back to README](../README.md) · [All docs](README.md)
