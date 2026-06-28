# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.8] - 2026-06-28

### Added

- `DEGIROParser`: CSV parser for DEGIRO Transactions exports with required-column validation
- `Calculator`: LIFO and FIFO lot-matching engine for Italian _Regime Dichiarativo_
- `GainsReport`: typed report with `plusvalenze`, `minusvalenze`, `netResult`, per-lot breakdown, ECB rates used, and accumulated warnings
- `ParseError`: typed error with codes `INVALID_CSV` and `MISSING_COLUMN` (+ `columnName`)
- `CalculationError`: thrown when a SELL has no matching open buy lots (includes `isin` and `date`)
- Multi-currency support: EUR (native), USD, GBP, CHF via bundled ECB historical snapshot (2019–present)
- ECB rate lookup with automatic 3-day weekend/holiday fallback
- CLI commands: `calc`, `validate`, `rates`, `config`, `stress-test`
- CLI: bilingual output — Italian default, `--lang en` for English
- CLI: `--json` flag on `calc` for machine-readable `GainsReport` output
- CLI: `--method LIFO|FIFO` flag on `calc` (default: LIFO)
- CLI: automatic ECB snapshot update when bundled rates are more than 7 days old
- Stress test suite: 100 generated scenarios covering LIFO/FIFO divergence, partial lots, multi-ISIN, multi-currency, same-day trades, ECB weekend fallback, and large portfolios (up to 200 transactions)
- Bundled sample CSV (`samples/sample-trades.csv`) for quick-start testing
