[← Back to README](../README.md) · [All docs](README.md)

# FAQ / Troubleshooting

**My CSV is rejected with "missing column" or "invalid CSV"**
Confirm you exported from Activity → **Transactions**, not the Account Statement. The parser requires the Transactions export format. For IBKR, confirm you exported an **Activity Flex Query** with date format `yyyyMMdd` and comma delimiter — see [Interactive Brokers CSV Format](csv-formats.md#interactive-brokers-csv-format-beta). A binary/corrupted file (not text/CSV at all) always exits with `Invalid CSV` and exit code 1, even without an explicit `--broker` — this is distinct from the "unable to detect broker" error (exit code 2) below, which only applies to well-formed CSVs in an unrecognized format.

**The broker isn't detected correctly / "unable to detect broker"**
Auto-detection relies on the file's header content (the `Local value currency` column for DEGIRO, the `Trades` section for IBKR). If your file matches neither format, pass `--broker degiro` or `--broker ibkr` explicitly.

**Some rows are skipped with a warning**
Rows are skipped (without aborting the calculation) when: the ISIN is empty, the currency is not EUR/USD/GBP/CHF, or no ECB rate exists within 3 trading days of the trade date. Run `validate` for details.

**Error "no open lots for ISIN X on date Y"**
The CSV contains a SELL for a position that has no prior BUY in the same file. The BUY may be in a prior year's export that was not included. Use `validate` to inspect the parsed transactions.

**ECB rates are outdated**
Run `minus-tracker rates --update`. The `calc` command never fetches rates on its own — refreshing is always an explicit, user-invoked action.

**LIFO or FIFO?**
LIFO is the standard lot-matching method under Italian tax law for the Regime Dichiarativo. FIFO is available for comparison or other jurisdictions. Consult your tax advisor for confirmation.

## Known Limitations

minus-tracker aggregates gains and losses from **all financial instruments into a single total**, regardless of their tax category.

Italian law requires that **redditi diversi** (individual stocks, derivatives, certificates — Art. 67 TUIR) and **redditi di capitale** (ETFs / UCITS funds — Art. 44 TUIR) be kept separate: a loss on an ETF cannot offset a gain on a stock, and vice versa.

**Portfolios holding only stocks or only ETFs:** the calculation is correct.
**Mixed portfolios (stocks + ETFs):** the reported net result cannot be used directly for tax filing. In this case, lots must be manually separated by tax category before filing, with the help of a qualified tax advisor.

`IBKRParser` (v0.11.0) is **beta**: the column spec has not yet been validated against a real
IBKR export — see [Interactive Brokers CSV Format](csv-formats.md#interactive-brokers-csv-format-beta).

[← Back to README](../README.md) · [All docs](README.md)
