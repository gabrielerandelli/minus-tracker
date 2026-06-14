# Part 4 — ECB Rates

## Approach

Historical ECB exchange rates are **bundled as a static JSON file** inside the npm package.
No network calls at runtime. The snapshot must cover at minimum 2019-01-01 to present.

## Supported currencies

EUR, USD, GBP, CHF (all rates expressed as units of foreign currency per 1 EUR).

## Snapshot format

```json
{
  "USD": { "2024-01-02": 1.094, "2024-01-03": 1.091 },
  "GBP": { "2024-01-02": 0.866 },
  "CHF": { "2024-01-02": 0.931 }
}
```

Key: ISO date (YYYY-MM-DD). EUR is always 1.0 — not stored.

## Lookup rules

1. Look up exact date. If found → use it.
2. If not found (weekend / ECB non-publishing day) → walk backwards up to **3 calendar days**
   to find the most recent prior rate.
3. If still not found after 3 days → emit warning, skip row.

## Converting a trade

```
totalEUR = |localAmount| / ecbRate   // rate = foreign per EUR
```

Example: USD 1,850 on 2024-01-02 (rate 1.094) → EUR 1,850 / 1.094 = **1,691.04**

## Snapshot update

The `rates` CLI command handles updates:

```
minus-tracker rates --check    # show date coverage and gaps
minus-tracker rates --update   # fetch latest from ECB SDMX API, merge into snapshot
```

The snapshot file lives at `src/data/ecb-rates.json` and is committed to the repo.
