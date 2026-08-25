# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `IBKRParser` did not skip zero-quantity `Trades` rows, unlike `DEGIROParser`, which has always
  treated a zero (or unparseable) quantity as a `QUANTITY_ZERO` skip condition. A zero-quantity
  row (e.g. a blank/malformed `Quantity` field in the export) produced a `Transaction` with
  `quantity: 0`, violating that field's documented "always positive" contract. `Calculator`
  divides by `quantity` when building each lot (`totalEUR / quantity`), so this silently turned
  into a `0/0` division, poisoning `plusvalenze`/`minusvalenze`/`netResult` in the final
  `GainsReport` with `NaN` — with no thrown error and no warning, since the row parsed
  "successfully". `IBKRParser` now skips zero-quantity `Trades` rows and pushes a `QUANTITY_ZERO`
  warning (row-numbered, `Trades`-prefixed), matching `DEGIROParser`'s existing behavior exactly.

- `Calculator.calculateGains()` could throw a spurious `CalculationError` ("No open lots") for a
  fully-balanced fractional-share position closed across multiple `SELL` transactions (e.g. a
  0.3-share `BUY` closed by a 0.1-share `SELL` followed by a 0.2-share `SELL`). Repeated
  floating-point subtraction in the LIFO/FIFO lot-matching loop could leave `lot.quantity` or the
  remaining sell quantity at a tiny non-zero residue (on the order of `2.22e-17`) instead of
  exactly `0`, causing the loop to either report a lot as still open when it was fully consumed,
  or to spuriously continue and find no lots left to match against. Both `lot.quantity` and the
  remaining sell quantity are now snapped to exactly `0` once they fall within a `1e-9` tolerance
  after each match, which absorbs floating-point noise many orders of magnitude larger than any
  realistic rounding residue while still correctly rejecting genuine oversell mismatches (e.g.
  selling 0.31 shares when only 0.3 were ever bought still throws `CalculationError` as before).

## [0.11.1] - 2026-08-24

### Fixed

- The bundled ECB rates snapshot was resolved via a runtime filesystem path computed relative to
  the compiled entry point (`../data/ecb-rates.json`), an assumption valid only for the `src/`
  layout. tsup bundles each entry point into a single flat file, so `dist/index.js` (mapped from
  `"exports"`/`"main"` to package consumers) resolved one directory above `dist/` entirely, and
  `dist/index.cjs` crashed outright since `import.meta.url` is undefined under CJS output — both
  making every `parser.parse()` call throw `"No ECB rates snapshot available"`, even for pure-EUR
  transactions with no currency conversion. This broke the documented public API
  (`import { DEGIROParser } from "minus-tracker"`) for all npm consumers; it escaped the test
  suite because tests import from `src/`, not the built `dist/` output. The snapshot is now
  imported as a JSON module (`with { type: "json" }`) so it's inlined as a JS literal at build
  time, removing the runtime path computation entirely.

## [0.11.0] - 2026-08-03

### Added

- `IBKRParser` **(beta)**: parses Interactive Brokers Activity Flex Query CSV exports (`Trades`,
  `Dividends`, `Withholding Tax`, and `Interest` sections) into the same `Transaction[]`/
  `IncomeRow[]` shape as `DEGIROParser`, with per-currency FX conversion, section-prefixed
  warnings, and independent per-section row counters (e.g. `"Trades row 3: ..."` and
  `"Dividends row 2: ..."` never share a counter). The column spec was derived from IBKR's public
  Flex Query documentation and third-party importers, not yet validated against a real user
  export — see the README's [Interactive Brokers CSV Format](README.md#interactive-brokers-csv-format-beta)
  section before relying on it for a tax filing.
- `Parser` interface: the shared `parse(csv): Transaction[]` / `warnings: string[]` /
  `incomeRows: IncomeRow[]` shape both `DEGIROParser` and `IBKRParser` implement, exported from
  the library root for consumers who want to accept either parser interchangeably.
- CLI: broker auto-detection on `calc`, `validate`, and `classify` — the CSV shape (DEGIRO vs
  IBKR) is detected automatically, or forced explicitly with the new `--broker <degiro|ibkr>`
  flag. A file matching neither signature exits with an explicit error instead of a confusing
  downstream parse failure.
- `ParseError` gains a `"MISSING_SECTION"` code (+ `sectionName`) for IBKR files missing their
  required `Trades` section; `sectionName`/`columnName` remain mutually exclusive per error code.

### Fixed

- `DEGIROParser`: withholding-tax pairing keyed only by `(ISIN, date)` gave every income row
  sharing that key the parsed CSV's **full** matched withholding total, over-counting withholding
  tax whenever multiple income rows shared an ISIN/date (e.g. two dividend payments on the same
  day in different currencies). The pairing key now also includes currency, and the matched total
  is allocated proportionally across the income rows sharing a key (weighted by each row's gross
  amount), instead of being applied in full to each one.

## [0.10.0] - 2026-07-26

### Added

- CLI: branded ASCII banner (echoing the `minus-tracker` logo's minus→arrow mark, navy→green
  gradient) shown on bare invocation, `--help`, and the new `--version` flag. Uses a truecolor
  gradient when attached to a TTY (respects `NO_COLOR`), falls back to a plain borderless layout
  in narrow terminals or when output is piped/redirected.

## [0.9.0] - 2026-07-21

### Changed

- `calc` no longer requires running `classify` first: if no `*.classify.json` sidecar is found
  next to the input CSV, `calc` now classifies automatically before computing gains — interactively
  (OpenFIGI lookup + confirm prompts) when a terminal is attached, or offline (with a printed
  notice) when there isn't one, e.g. in scripts/CI. The resulting sidecar is written to disk just
  like running `classify` manually, so subsequent runs reuse it instantly. `classify` remains
  available for explicit/interactive use and now accepts the same `--offline` flag on `calc` to
  force offline classification regardless of TTY.

## [0.8.3] - 2026-07-16

### Changed

- `README.md`: added a banner image (`.github/assets/banner.png`) above the title, giving the
  GitHub repo and npm package page a branded header.

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
