# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.0] - 2026-07-03

### Added

- `DEGIROParser.incomeRows`: parses dividend and coupon/interest rows (DIVIDEND, COUPON, CEDOLA, INTEREST) into typed `IncomeRow[]`, with FX conversion via ECB rate lookup and withholding-tax pairing by `(ISIN, date)` independent of CSV row order
- Dichiarazione engine: `QuadroRTReport` (Bucket B net result, carryforward application oldest-first with 4-year expiry) and `QuadroRMReport` (capital income by 26%/12.5% rate, foreign dividends, coupons), exposed as `GainsReport.dichiarazione`
- CLI: `calc --export-dichiarazione [path]` writes a `DichiarazioneReport` JSON file (Modello Redditi PF fields); default path is `<csv-basename>.dichiarazione.json`
- CLI: `calc` renders a "MODELLO REDDITI PF" section when a classification sidecar is present, with graceful degradation (soft warning suggesting `classify` first) when absent
- New type exports: `IncomeRow`, `CarryForwardEntry`, `DividendEntry`, `CedolaEntry`, `QuadroRTReport`, `QuadroRMReport`, `DichiarazioneReport`

### Fixed

- `package.json` `exports` field pointed to `dist/esm/index.js` and `dist/cjs/index.cjs`, which the build never produced (actual output is flat `dist/index.js` / `dist/index.cjs`). This broke `import`/`require` of the published package entirely for any consumer — corrected to match the real build output and added explicit `types` conditions for both ESM and CJS resolution.

### Changed

- `calc` no longer auto-refreshes the bundled ECB rate snapshot over the network when it is more than 7 days stale (this made `calc` network-dependent and non-deterministic, and could corrupt `--json` output). Refreshing rates is now always an explicit, user-invoked action via `rates --update`.

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
