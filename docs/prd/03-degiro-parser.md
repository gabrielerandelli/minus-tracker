# Part 3 — DEGIRO Parser

## Input format

DEGIRO exports two CSVs. The parser targets the **Transactions** export (not Account Statement).

### Column spec

| Column                       | Example        | Notes                                                      |
| ---------------------------- | -------------- | ---------------------------------------------------------- |
| `Date`                       | `14-01-2024`   | DD-MM-YYYY                                                 |
| `Time`                       | `09:05`        | HH:MM, local time (ignored)                                |
| `Product`                    | `Apple Inc`    | Display name                                               |
| `ISIN`                       | `US0378331005` | Required; hard error if missing                            |
| `Exchange`                   | `XNAS`         | Ignored                                                    |
| `Execution centre`           | `XNAS`         | Ignored                                                    |
| `Quantity`                   | `10`           | Positive = buy, negative = sell                            |
| `Price`                      | `185.00`       | Per unit in trade currency                                 |
| `Local value`                | `-1850.00`     | Quantity × Price                                           |
| `Local value currency`       | `USD`          | ISO 4217                                                   |
| `Value`                      | `-1711.00`     | EUR equivalent (DEGIRO-computed, ignored — we recalculate) |
| `Value currency`             | `EUR`          | Always EUR                                                 |
| `Exchange rate`              | `0.925`        | DEGIRO's rate (ignored — we use bundled ECB rate)          |
| `Transaction costs`          | `-2.00`        | In EUR; negative = cost                                    |
| `Transaction costs currency` | `EUR`          | Always EUR                                                 |
| `Total`                      | `-1713.00`     | Ignored (we compute from parts)                            |
| `Total currency`             | `EUR`          | Always EUR                                                 |
| `Order ID`                   | `abc-123`      | Ignored                                                    |

### Parsing rules

1. Skip header row.
2. Skip rows where `ISIN` is empty → emit warning.
3. `Quantity > 0` → `BUY`, `Quantity < 0` → `SELL` (store as positive).
4. Parse `Date` as DD-MM-YYYY → convert to ISO (YYYY-MM-DD).
5. Look up ECB rate for `Local value currency` on `Date` (see [Part 4](04-ecb-rates.md)).
6. If ECB rate not found → emit warning, skip row.
7. `totalEUR = |Local value| * ecbRate`
8. `feesEUR = |Transaction costs|` (already in EUR; use 0 if blank).
9. Rows with `Local value currency = EUR` → `fxRate` is `undefined`.

### Hard errors (throw ParseError)

- File is not valid CSV
- Header row missing required columns (`ISIN`, `Quantity`, `Price`, `Date`)

### Soft warnings (skip row, append to report.warnings)

- Missing ISIN
- Unsupported currency (not in ECB snapshot)
- ECB rate not found for date
- Quantity = 0
