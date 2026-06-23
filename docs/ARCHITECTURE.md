# minus-tracker — Architecture

This document describes the internal design of the library for contributors.

---

## Module Layout

```
src/
├── index.ts              ← public library entry (no i18n)
├── types.ts              ← Transaction, MatchedLot, GainsReport, LotMethod
├── errors.ts             ← ParseError, CalculationError
├── data/
│   └── ecb-rates.json    ← bundled ECB historical snapshot
├── rates/
│   └── index.ts          ← rate lookup with weekend fallback
├── parser/
│   ├── index.ts          ← DEGIROParser class
│   └── warnings.ts       ← WarningEntry union + warningToEnglish()
├── calculator/
│   └── index.ts          ← Calculator class (LIFO/FIFO lot matching)
└── i18n/                 ← CLI-only; never imported by src/index.ts
    ├── types.ts           ← LocaleStrings interface, SupportedLocale
    ├── it.ts              ← Italian locale object
    ├── en.ts              ← English locale object
    ├── settings.ts        ← resolveLocale(), saveLocale(), config path
    └── index.ts           ← getStrings(), re-exports

src/cli/
├── index.ts              ← entry point; resolves locale, dispatches commands
├── renderer.ts           ← table + summary formatting
└── commands/
    ├── calc.ts
    ├── validate.ts
    ├── rates.ts
    └── config.ts
```

**Tree-shakeability rule:** `src/index.ts` (library entry) never imports from `src/i18n/`.
Bundlers targeting the library entry include zero locale code.

---

## Core Types

```ts
type LotMethod = "LIFO" | "FIFO";

interface Transaction {
  isin: string;
  product: string;
  date: string; // ISO (YYYY-MM-DD)
  type: "BUY" | "SELL";
  quantity: number; // always positive
  pricePerUnit: number;
  currency: string; // ISO 4217
  totalLocal: number; // signed: negative for BUY, positive for SELL
  totalEUR: number; // |totalLocal| / ecbRate — always positive
  feesEUR: number;
  fxRate?: number; // undefined when currency === "EUR"
}

interface MatchedLot {
  isin: string;
  product: string;
  quantity: number;
  buyDate: string;
  sellDate: string;
  buyPriceEUR: number;
  sellPriceEUR: number;
  buyCostEUR: number; // total cost basis incl. fees
  sellProceedsEUR: number; // total proceeds minus fees
  gainLossEUR: number;
  buyFxRate?: number;
  sellFxRate?: number;
}

interface GainsReport {
  method: LotMethod;
  taxYear: number;
  plusvalenze: number;
  minusvalenze: number;
  netResult: number;
  lots: MatchedLot[];
  ratesUsed: Record<string, number>; // e.g. "USD:2024-01-02": 1.094
  warnings: string[];
  generatedAt: string;
}
```

---

## Parser (`DEGIROParser`)

Targets the DEGIRO **Transactions** export (not the Account Statement).

- Reads a CSV string; detects columns by header name.
- Throws `ParseError` immediately on structural failures (invalid CSV, missing required column).
- Skips individual rows that are unresolvable (missing ISIN, unsupported currency, no ECB rate,
  zero quantity) and records a warning per skipped row.
- Converts dates from DD-MM-YYYY (DEGIRO format) to ISO YYYY-MM-DD.
- Looks up the ECB rate for `Local value currency` on the trade date (see ECB Rates below).
- EUR-denominated rows bypass the rate lookup; `fxRate` is left `undefined`.
- `parser.warnings` returns English strings (stable programmatic contract).
- The CLI accesses the structured `parser.warningEntries` internally to render locale-aware output;
  `WarningEntry` is not part of the public library API.

**Hard errors (throw `ParseError`):**

| Trigger                          | `error.code`                              |
| -------------------------------- | ----------------------------------------- |
| File is not valid CSV            | `"INVALID_CSV"`                           |
| Header missing a required column | `"MISSING_COLUMN"` (+ `error.columnName`) |

Required columns: `ISIN`, `Quantity`, `Price`, `Date`, `Local value`, `Local value currency`.

**Soft warnings (skip row, append to `report.warnings`):**

| Trigger                           | Warning                                          |
| --------------------------------- | ------------------------------------------------ |
| Empty ISIN                        | `"Row N: missing ISIN — skipped"`                |
| Currency not in ECB snapshot      | `"Row N: unsupported currency X — skipped"`      |
| No ECB rate within 3-day lookback | `"Row N: no ECB rate for CCY on DATE — skipped"` |
| Quantity = 0                      | `"Row N: quantity is 0 — skipped"`               |

---

## ECB Rates (`src/rates/`)

Historical rates are **bundled as a static JSON file** — no network calls at runtime.
Coverage: 2019-01-01 to present. Supported currencies: USD, GBP, CHF (EUR is always 1.0).

```json
{ "USD": { "2024-01-02": 1.094, ... }, "GBP": { ... }, "CHF": { ... } }
```

**Lookup algorithm:**

1. Try the exact trade date.
2. If absent (weekend / ECB non-publishing day), walk back up to 3 calendar days.
3. If still not found → emit warning, skip row.

**Conversion formula:** `totalEUR = |localAmount| / ecbRate`

**Rate lookup priority at runtime:**

1. `~/.config/minus-tracker/ecb-rates.json` — user-updated via `rates --update`
2. `src/data/ecb-rates.json` — bundled with the package

---

## Calculator & Lot Matching

The `Calculator` class takes a `Transaction[]` and runs LIFO or FIFO lot matching.

**Algorithm:**

1. Sort all transactions ascending by date; on the same date, BUYs before SELLs.
2. Maintain an `openLots` map keyed by ISIN. Each entry is an ordered array of lots.
3. For each BUY: push a new lot onto the end of `openLots[isin]`.
4. For each SELL:
   - **LIFO**: pop lots from the end (most recent first).
   - **FIFO**: pop lots from the start (oldest first).
   - Consume lots until the sell quantity is fully matched.
   - Partial lot consumption: decrement the lot's remaining quantity and put it back.
   - Stack exhausted before sell is matched → throw `CalculationError`.

**Cost basis:**

```
buyCostEUR      = (lot.pricePerUnitEUR × matchedQty) + allocatedBuyFees
sellProceedsEUR = (sell.totalEUR / sell.quantity × matchedQty) − allocatedSellFees
gainLossEUR     = sellProceedsEUR − buyCostEUR
```

Fees are allocated proportionally to the matched quantity relative to the original lot size.

**Rounding:** All intermediate arithmetic uses full float precision. Only final output fields
(`MatchedLot.gainLossEUR`, `GainsReport.plusvalenze`, etc.) are rounded to 2 decimal places
using half-up rounding.

**Report aggregation:**

```
plusvalenze  = Σ gainLossEUR where gainLossEUR > 0
minusvalenze = Σ |gainLossEUR| where gainLossEUR < 0
netResult    = plusvalenze − minusvalenze
```

---

## CLI

Four commands, all accepting `--lang <it|en>` for a one-shot locale override:

| Command                    | Purpose                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `calc <file.csv>`          | Calculate gains/losses; outputs table (default) or JSON (`--json`) |
| `validate <file.csv>`      | Parse-only check; exit 0 on warnings, exit 1 on hard errors        |
| `rates --check / --update` | Inspect or extend the bundled ECB snapshot                         |
| `config --lang / --show`   | Persist or display the locale preference                           |

**Exit codes:** 0 success · 1 hard error (ParseError / CalculationError) · 2 invalid usage

The CLI resolves the locale **once** at startup and passes a `LocaleStrings` object to every
command function. Commands never call `getStrings()` themselves.

---

## Error Handling

```ts
class ParseError extends Error {
  code: "INVALID_CSV" | "MISSING_COLUMN";
  columnName?: string;
}

class CalculationError extends Error {
  isin: string;
  date: string; // ISO 8601
}
```

The English `.message` is the stable API for library consumers.
The CLI reads `.code` / `.isin` / `.date` to render locale-aware messages without reparsing
the string.

---

## i18n

The CLI is bilingual: Italian (`it`, default) and English (`en`).

**Locale resolution order (highest to lowest priority):**

1. `--lang` flag
2. `MINUS_TRACKER_LANG` environment variable
3. `~/.config/minus-tracker/config.json` → `"locale"` field
4. Hardcoded default: `"it"`

An invalid locale value causes exit code 2 with an English error message.

The `LocaleStrings` interface in `src/i18n/types.ts` is exhaustively typed — adding a key
causes a compile error in both `it.ts` and `en.ts` until both locale objects are updated.

**Important:** `PLUSVALENZE` and `MINUSVALENZE` are Italian tax terms with no English
equivalent; they appear unchanged in the English locale output.
The disclaimer (`minus-tracker è un ausilio al calcolo, non consulenza fiscale.`) is always
rendered in Italian regardless of the active locale.

---

## Release & Publishing

Releases are fully automated via GitHub Actions (`.github/workflows/release.yml`).

**Trigger:** pushing a `vX.Y.Z` tag to the repository.

**Pipeline (3 sequential jobs):**

| Job            | Steps                                                             |
| -------------- | ----------------------------------------------------------------- |
| test-and-build | `npm ci` → `npm run build` → `npm test` → upload `dist/` artifact |
| publish        | Download `dist/` → `npm publish --provenance --access public`     |
| create-release | Auto-generate GitHub Release notes                                |

**Authentication:** npm [trusted publishing](https://docs.npmjs.com/generating-provenance-statements) via OIDC — no stored tokens or secrets required. The workflow requests `id-token: write` and npm verifies the GitHub Actions identity directly.

**To cut a release:**

```bash
# 1. Bump version in package.json and README status badge, then commit and push
# 2. Tag and push — this triggers the workflow
git tag v0.5.4 && git push origin v0.5.4
```

The published package is available at `https://www.npmjs.com/package/@gabrielerandelli/minus-tracker`.

---

## Adding a Broker Parser

To add support for a new broker (e.g. IBKR):

1. Create `src/parser/<broker>/index.ts` exporting a class with `parse(csv: string): Transaction[]`.
2. The class should follow the same warning pattern: internal `WarningEntry[]` + `warnings` getter.
3. Export the new class from `src/index.ts`.
4. Add test fixtures and unit tests covering the broker's CSV format.

The `Calculator` is broker-agnostic — it only consumes `Transaction[]`.
