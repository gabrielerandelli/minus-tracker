# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.2] - 2026-07-05

### Fixed

- `classify --offline` no longer mislabels every instrument as an ETF at a flat 26% tax rate —
  it now delegates to the same `Classifier` offline logic the MCP server already used correctly,
  producing an unconfirmed, correctly-typed stub for unresolved ISINs instead of a confident
  wrong guess.
- The mixed-instrument-type warning (`calc` with no classify sidecar, mixed IE/non-IE ISINs) is
  now always English, matching every other Calculator-level warning — it previously stayed
  hardcoded Italian even under `--lang en`.
- `stress-test --output-dir <dir>` no longer deletes a user-supplied directory. Only the
  auto-generated temp directory is ever removed automatically; `--keep` now only affects that
  auto-generated case.
- The MCP server's unknown-tool-name error is now JSON-shaped (`{code:"UNKNOWN_TOOL", message}`),
  consistent with every other `isError` payload, instead of a plain string.
- `parse_transactions`/`calc`/`validate` now correctly reject non-null-byte binary garbage as
  `INVALID_CSV` instead of falling through to a misleading "missing required column" error.

### Added

- `GainsReport.bucketB.carryForwardEntriesRemaining`: reports, per supplied `carryForward` entry,
  how much of its original amount is still unused and within its 4-year carry window — the data
  needed to correctly roll a carry-forward balance into next year's calculation. Additive;
  `carryForwardRemaining` is unchanged for backward compatibility (it reports a different thing:
  this year's own uncovered loss, now documented more clearly in `types.ts`).

### Changed

- `README.md`: documented that `classify` requires an interactive terminal (TTY), or the
  `--offline` flag in scripted/CI contexts.

## [0.8.1] - 2026-07-05

### Fixed

- `--carry-forward` and `--export-dichiarazione` were never registered with `parseArgs`, so an
  explicit value silently leaked into positionals — corrupting the CSV file path or silently
  dropping the requested export path in favor of the default. Both flags are now registered and
  behave as documented.
- `calc`'s file/sidecar/export error messages were hardcoded in English even in Italian mode; they
  now go through the locale system like every other message.
- `rates --check` always reported "no gaps" regardless of actual snapshot coverage; it now
  detects missing business days per currency.
- README no longer claims `calc` auto-refreshes ECB rates (removed in v0.7.0).

### Changed

- `package.json` description and keywords now mention the MCP server / AI-agent use case.
- README front-loads the liability disclaimer, the MCP/AI-agent story, and the FAQ-correctness
  test signal; adds npm downloads/Node/MCP badges.
- Added `SECURITY.md` and `CONTRIBUTING.md`.

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
