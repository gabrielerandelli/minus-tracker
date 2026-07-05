# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] - 2026-07-05

### Added

- Stateless `Classifier.classify()` mode: `sidecarPath` is now optional. When omitted, `classify()`
  performs zero filesystem access and resolves classifications purely from a new `ClassifyOptions`
  parameter (`existingClassification`, `overrides`, `offline`, `onBatchProgress`) plus OpenFIGI
  lookups. `overrides` always wins, even over `existingClassification`, and is never sent to
  OpenFIGI. `offline: true` skips OpenFIGI entirely and stubs unresolved ISINs.
  `onBatchProgress(done, total)` fires after each completed OpenFIGI batch.
- `minus-tracker-mcp` binary: a new [MCP](https://modelcontextprotocol.io) server exposing
  `parse_transactions`, `classify_instruments`, and `calculate_gains` as tools over stdio, so
  agents can drive the full parse → classify → calculate pipeline headlessly, without shelling out
  to the CLI. Tool input schemas are generated at build time from `src/types.ts` (no hand-maintained
  schema to fall out of sync).

### Changed

- `@modelcontextprotocol/sdk` and `ajv` are added as dependencies, scoped to the `mcp` build target
  only — the core library and CLI bundles remain free of both (zero-runtime-dependency guarantee
  unaffected outside the new MCP entrypoint).

## [0.6.0] - 2026-06-29

### Added

- Two-bucket tax classification engine: routes matched lots into Bucket A (_redditi diversi_ —
  stocks, derivatives, certificates, taxed at 26%/12.5%) or Bucket B (_redditi di capitale_ —
  ETFs/UCITS funds), per Italian tax law (Art. 67 vs Art. 44 TUIR)
- `Classifier`: `load()`/`classify()` — OpenFIGI-backed instrument classification with a JSON
  sidecar file (`*.classify.json`) caching resolved/user-confirmed asset classes across runs
- CLI: `classify` command (interactive and `--offline` modes) to build/update the sidecar
- CLI: `calc` auto-discovers a sidecar and renders the Bucket A/B breakdown when present
- `--carry-forward` flag: applies prior-year Bucket B losses (oldest-first, 4-year expiry rule)
- New type exports: `AssetClass`, `ClassificationEntry`, `ClassificationMap`, `BucketAReport`,
  `BucketBReport`, `CarryForward`

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
