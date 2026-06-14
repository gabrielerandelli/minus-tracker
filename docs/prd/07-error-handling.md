# Part 7 — Error Handling

## Taxonomy

| Severity | Type               | Behaviour                                          |
| -------- | ------------------ | -------------------------------------------------- |
| Hard     | `ParseError`       | Thrown immediately; aborts parsing                 |
| Hard     | `CalculationError` | Thrown during lot matching; aborts calculation     |
| Soft     | Warning            | Row skipped; message appended to `report.warnings` |

## Hard errors — ParseError

Thrown by `DEGIROParser.parse()`:

| Trigger                                                                                      | Message                             |
| -------------------------------------------------------------------------------------------- | ----------------------------------- |
| File is not valid CSV                                                                        | `"Invalid CSV: unable to parse"`    |
| Header missing required column                                                               | `"Missing required column: <name>"` |
| Required columns: `ISIN`, `Quantity`, `Price`, `Date`, `Local value`, `Local value currency` |                                     |

### Structured error fields

`ParseError` and `CalculationError` carry machine-readable fields in addition to their English
`.message` string. These fields allow the CLI to render locale-aware output without reparsing
the message.

```typescript
// ParseError carries:
//   .code: "INVALID_CSV" | "MISSING_COLUMN"
//   .columnName?: string   (present when code === "MISSING_COLUMN")

// CalculationError carries:
//   .isin: string
//   .date: string   (ISO 8601)
```

The English `.message` on the exception object is the stable contract for programmatic
(library) consumers. The CLI uses the structured fields to render in the active locale.

## Hard errors — CalculationError

Thrown by `Calculator.calculateGains()`:

| Trigger                        | Message                                    |
| ------------------------------ | ------------------------------------------ |
| SELL has no open lots for ISIN | `"No open lots for ISIN <isin> on <date>"` |

## Soft warnings

Emitted by parser; surfaced in `GainsReport.warnings[]`:

| Trigger                                 | Warning message                                        |
| --------------------------------------- | ------------------------------------------------------ |
| Row has empty ISIN                      | `"Row <n>: missing ISIN — skipped"`                    |
| Currency not in ECB snapshot            | `"Row <n>: unsupported currency <X> — skipped"`        |
| No ECB rate found within 3-day lookback | `"Row <n>: no ECB rate for <CCY> on <date> — skipped"` |
| Quantity is 0                           | `"Row <n>: quantity is 0 — skipped"`                   |

## CLI behaviour

- Hard error → non-zero exit code + message to stderr. The CLI catches `ParseError` and
  `CalculationError` and renders their messages using the structured `.code`/`.isin`/`.date`
  fields in the active locale (see [Part 9](09-i18n.md)).
- Warnings → the CLI reads `parser.warningEntries` (a `WarningEntry[]`, not exported in the
  library's public API) and renders each entry in the active locale. `GainsReport.warnings[]`
  always contains English strings for programmatic consumers.
- `validate` command: exits 0 even if warnings exist; exits 1 only on hard errors.
