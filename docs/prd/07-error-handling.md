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

- Hard error → non-zero exit code + message to stderr.
- Warnings → printed after the report table (or included in JSON).
- `validate` command: exits 0 even if warnings exist; exits 1 only on hard errors.
