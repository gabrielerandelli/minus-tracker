# Part 6 — CLI

## Installation

```
npm install -g minus-tracker
```

## Commands

### `calc` — calculate gains/losses

```
minus-tracker calc [options] <file.csv>

Options:
  --method <LIFO|FIFO>   Lot matching method (default: LIFO)
  --json                 Output machine-readable JSON instead of table
```

**Default output (table):**

```
minus-tracker calc trades.csv

METHOD: LIFO | TAX YEAR: 2023

ISIN          PRODUCT          QTY  BUY DATE    SELL DATE   BUY EUR   SELL EUR  GAIN/LOSS
US0378331005  Apple Inc         10  2023-03-01  2023-11-15  1,234.00  1,500.00   +266.00
IE00B4L5Y983  iShares MSCI W.   5  2023-01-10  2023-09-20    800.00    750.00    -50.00

────────────────────────────────────────────────────────────────────────
PLUSVALENZE:    266.00 EUR
MINUSVALENZE:    50.00 EUR
RISULTATO NETTO: 216.00 EUR

AVVERTENZE: 0
Generated: 2024-01-15T10:32:00Z

minus-tracker è un ausilio al calcolo, non consulenza fiscale.
```

**JSON output (`--json`):**

```json
{
  "method": "LIFO",
  "plusvalenze": 266.00,
  "minusvalenze": 50.00,
  "netResult": 216.00,
  "lots": [...],
  "ratesUsed": { "USD:2023-03-01": 1.094 },
  "warnings": [],
  "generatedAt": "2024-01-15T10:32:00Z"
}
```

---

### `validate` — check CSV without calculating

```
minus-tracker validate <file.csv>

OK: 143 transactions parsed, 0 hard errors
WARN: 2 rows skipped (no ECB rate for CHF on 2023-12-24)
```

Exit code 0 if no hard errors; 1 if any hard error.

---

### `rates` — manage bundled ECB snapshot

```
minus-tracker rates --check
# Coverage: 2019-01-01 → 2024-01-12 | Currencies: USD, GBP, CHF
# Gaps: none

minus-tracker rates --update
# Fetching ECB SDMX... done. Added 45 new dates. Snapshot updated.
# (writes to src/data/ecb-rates.json in the local package)
```

`--update` requires network access and writes to the package's data file.
Intended for maintainers, not end users.

## Exit codes

| Code | Meaning                                        |
| ---- | ---------------------------------------------- |
| 0    | Success                                        |
| 1    | Hard error (ParseError or CalculationError)    |
| 2    | Invalid CLI usage (unknown flag, missing file) |
