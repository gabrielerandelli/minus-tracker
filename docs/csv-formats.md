[← Back to README](../README.md) · [All docs](README.md)

# CSV Formats

## DEGIRO CSV Format

Export from **Activity → Transactions** (NOT the Account Statement) in your DEGIRO account. Use the default export with all columns selected.

Supported currencies: **EUR** (no conversion), **USD**, **GBP**, **CHF** (bundled ECB historical rates, 2019–present).

Dates in the DEGIRO export are in `DD-MM-YYYY` format; the parser converts them to ISO automatically.

Rows with a missing ISIN, unsupported currency, or no ECB rate within 3 trading days of the trade date are skipped with a warning (not an error) — run `validate` to inspect them before calculating.

Numeric columns (`Quantity`, `Price`, `Local value`, `Transaction costs`) may use a thousands-separator comma (e.g. `2,500`), which some spreadsheet software adds when re-saving a CSV — the parser normalizes these correctly rather than misreading them.

`Transaction costs currency` is read independently from `Local value currency` — a fee billed in a different currency than the trade itself (e.g. an FX/connectivity surcharge on an otherwise EUR-denominated trade) is converted to EUR using the ECB rate for its own currency and date, not assumed to already be in EUR. The same missing-ISIN/unsupported-currency/no-ECB-rate skip-with-warning rule above applies to the fee currency too — except when the cell is simply **blank** while `Transaction costs` is non-zero: the row is kept, the fee is assumed to be in the trade's own `Local value currency`, and a `FEE_CURRENCY_ASSUMED` warning is added so you can double-check the assumption against your broker statement.

## Interactive Brokers CSV Format (beta)

> ⚠️ **Beta support.** The IBKR column spec was derived from Interactive Brokers' public
> documentation and third-party open-source importers, **not yet validated against a real user
> export**. Always double-check the output before relying on it for a tax filing, and
> [open an issue](https://github.com/gabrielerandelli/minus-tracker/issues) if you spot a
> mismatch against your own export.

Unlike DEGIRO, IBKR has no fixed export — the first time, you need to configure an **Activity
Flex Query** in **IBKR Client Portal**:

1. In Client Portal, go to **Performance & Reports** → **Flex Queries** (or **Reports** →
   **Flex Queries**, depending on your interface version)
2. Create a new **Activity Flex Query**
3. Enable the **Trades** section (required) and, if you also want capital-income handling,
   **Dividends**, **Withholding Tax**, and **Interest** (optional)
4. In the query's format settings, set:
   - **Date format:** `yyyyMMdd`
   - **Field delimiter:** comma
   - **Include header row:** yes
5. Save and run the query, then download the result as **CSV** (up to 5 years of history in a
   single export)

The downloaded file has all enabled sections concatenated into one CSV — that's expected,
`IBKRParser` parses each section independently. Supported currencies: same as DEGIRO (EUR, USD,
GBP, CHF). The broker (DEGIRO/IBKR) is auto-detected from the file's contents; use
`--broker ibkr` to force it explicitly.

Trades rows with a missing ISIN, zero quantity, unsupported currency, no ECB rate within 3
trading days of the trade date, or a `Buy/Sell` value other than exactly `BUY` or `SELL` are
skipped with a warning (not an error), same as DEGIRO — run `validate` to inspect them before
calculating. As with DEGIRO's `Transaction costs currency`, a **blank** `IBCommissionCurrency`
cell on a row with a non-zero `IBCommission` does not skip the row: the commission is assumed to
be in the trade's own `CurrencyPrimary`, flagged with a `FEE_CURRENCY_ASSUMED` warning.

Numeric columns (`Quantity`, `TradePrice`, `IBCommission`, and `Amount` in the `Dividends`/
`Withholding Tax`/`Interest` sections) may use a thousands-separator comma (e.g. `2,500`), which
some spreadsheet software adds when re-saving a CSV — the parser normalizes these correctly
rather than misreading them.

For instruments like options and futures, trade value is computed applying the optional
`Multiplier` column (e.g. 100 for a standard equity option), which defaults to 1 when the column
is absent.

## Next steps

- [CLI Usage](cli-usage.md) — validate and calculate against your CSV
- [FAQ / Troubleshooting](faq.md) — common CSV-related errors

[← Back to README](../README.md) · [All docs](README.md)
