# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **`Calculator.calculateGains()` still threw a spurious `NO_OPEN_LOTS` error when closing a
  fractional-share position built from *many* BUY lots, even after the fixed `5e-8`
  `SELL_CLOSE_TOLERANCE` introduced to handle this class of bug (see the 0.13.1-era fix below).**
  That tolerance was sized for a 3-lot example and doesn't scale with the number of lots consumed
  by a single SELL: each independently-8dp-rounded BUY lot (the precision real brokers export
  fractional quantities at) contributes up to `0.5e-8` of its own worst-case rounding error, so the
  worst-case *cumulative* residual across `N` lots grows roughly linearly with `N`. A position built
  from 107 daily fractional BUYs of `0.00934579` shares each (`round(1/107, 8dp)` — a realistic
  shape for a DEGIRO/IBKR recurring/fractional investment plan run over a few months), closed by a
  single `1.00000000`-share SELL, left a `~4.7e-7` residual once every open lot was legitimately
  consumed — about 9.4x the old fixed `5e-8` tolerance — and threw `NO_OPEN_LOTS` on a position
  that was, for all real-world purposes, fully and correctly closed. The exhaustion check now uses
  a dynamic tolerance that scales with the number of lots actually consumed while matching that
  specific SELL (`lotsConsumedThisSell * SELL_CLOSE_TOLERANCE_PER_LOT`, floored at the original
  `5e-8` so few-lot behavior is unaffected, and capped at a `1e-6` ceiling that stays four orders of
  magnitude below any genuine oversell, e.g. selling `0.01` shares more than were ever bought — which
  still throws exactly as before, regardless of lot count). New regression test:
  `test/regression-fractional-lot-fp-epsilon.test.ts`.
- **`Calculator.calculateGains()` silently inflated the Bucket B taxable base (`bucketB.netResult`)
  above its true value when a supplied `CarryForward` entry had a negative `amount`.** Neither the
  `CarryForward` type (`{ year: number; amount: number }`) nor the library/MCP API surface
  (`CalculatorOptions.carryForward`, `calculate_from_csv`/`calculate_gains`'s `carryForward` input)
  validates that `amount` is non-negative — only the CLI's own `--carry-forward <YYYY>:<amount>`
  flag parser rejects a non-positive value. A negative amount is an easy, realistic mistake by
  analogy with `gainLossEUR`, which IS negative for losses elsewhere in this codebase (e.g. an
  agent driving the MCP server could plausibly pass last year's loss as `-500` instead of `500`).
  When Bucket B had a net gain for the tax year (`remaining > 0`), `Math.min(entry.amount,
  remaining)` evaluated to that negative amount, and the carry-forward loop then unconditionally
  ran `remaining -= consumed` — subtracting a negative number, which *increases* `remaining`
  instead of leaving it untouched — silently inflating `bucketB.netResult` above the true taxable
  base and reporting a nonsensical negative `bucketB.carryForwardApplied`. Worse, the same input
  made `bucketB.netResult` disagree with `dichiarazione.quadroRT.imponibileNetto` for the identical
  underlying result: `buildQuadroRT()` in `src/dichiarazione/engine.ts` already guards its
  structurally identical update behind `if (consumed > 0)`, so it was unaffected — but
  `Calculator`'s own loop lacked that guard, reintroducing the exact class of same-report
  divergence the `REG-004` fix (above) already closed for a different trigger. `Calculator` now
  wraps `carryForwardApplied += consumed; remaining -= consumed;` in the identical `if (consumed >
  0)` guard `buildQuadroRT` already uses, so a non-positive `consumed` (from a zero or negative
  carry-forward amount) is a pure no-op, restoring agreement between `bucketB.netResult` and
  `dichiarazione.quadroRT.imponibileNetto` for this input shape too. New regression test:
  `test/dichiarazione.test.ts`'s `REG-006`.
- **A `carryForward` entry dated the same year as, or a future year relative to, the report's
  `taxYear` was silently applied instead of being rejected, incorrectly wiping out real Bucket B
  capital gains.** Both `Calculator.calculateGains()` (`src/calculator/index.ts`) and the
  Dichiarazione engine's `buildQuadroRT()` (`src/dichiarazione/engine.ts`) only guarded against a
  carry-forward loss being *too old* (`taxYear - entry.year > 4`, per the documented 4-year
  expiry rule) but never checked the other side of that window: an entry with
  `entry.year >= taxYear` — a "loss" dated in the current tax year, or worse, in a future year
  relative to the report being computed — was consumed against `plusvalenze` exactly like a
  legitimate prior-year loss. Per Art. 68 co. 5 TUIR, a loss can only offset gains realized 1 to 4
  tax years *after* it, never gains from the same year or an earlier one, so this let a single
  malformed or mistyped entry (e.g. a transposed digit in a `--carry-forward YYYY:amount` CLI
  flag, or a `~/.config/minus-tracker/carryforward.json` left with a newer entry while generating
  a report for an earlier `--year`) silently understate a real, already-realized taxable gain
  with no warning. Both call sites now share a single internal eligibility rule,
  `isCarryForwardEligible(taxYear, entryYear)` (new `src/carry-forward.ts`, not part of the
  public API), requiring `1 <= taxYear - entryYear <= 4`; an entry outside that window — too old
  *or* not yet eligible — is dropped from consumption exactly like an already-expired entry
  always was: it contributes nothing to `carryForwardApplied` and does not reappear in
  `carryForwardEntriesRemaining` / `carryForwardRiportato`. No public API changed
  (`Calculator`, `CalculatorOptions`, `CarryForward`, `CarryForwardEntry`, `DEGIROParser`,
  `IBKRParser`, `Classifier` are all unchanged). New regression tests:
  `test/regression-future-dated-carryforward.test.ts` and two new cases in
  `test/dichiarazione.test.ts`.

- **`Calculator.calculateGains()`'s Quadro RM export (`dichiarazione.quadroRM.dividendiEsteri` /
  `.cedole`) contained unrounded, many-decimal-place EUR amounts instead of figures rounded to
  the cent.** `buildQuadroRM()` copied `IncomeRow.grossAmount`/`withholdingTax` straight through
  to `DividendEntry.lordo`/`rittenutaEstera` and `CedolaEntry.importo`/`rittenutaEstera` with no
  rounding, even though every other monetary figure the Dichiarazione engine produces —
  `QuadroRTReport`'s `differenza`/`imponibileNetto`/`imposta`/carry-forward `importo`, and Quadro
  RM's own `capitaleAliquota26`/`capitaleAliquota125` — is already rounded to 2 decimal places
  before being placed on the report. Any non-EUR dividend or bond coupon (the ordinary case for a
  US-listed stock or bond held via DEGIRO/IBKR) produces a `grossAmount`/`withholdingTax` with
  many trailing decimals once converted through an ECB rate (e.g. `92.4812725423102`), and that
  raw floating-point value flowed unchanged into `report.dichiarazione.quadroRM` and into the JSON
  file written by `dichiarazione.exportTo()` — the library's actual Modello Redditi PF filing aid,
  where amounts must be expressed to the cent. `buildQuadroRM()` now rounds `lordo`/`importo` and
  `rittenutaEstera` with the same `roundHalfUp()` helper already used everywhere else in
  `src/dichiarazione/engine.ts`, matching the PRD's documented rule ("Values rounded to 2 decimal
  places in output only", `docs/prd/14-dichiarazione-engine.md`). `IncomeRow.grossAmount`/
  `withholdingTax` themselves are untouched and remain unrounded internal EUR figures, consistent
  with `Transaction.totalEUR`. New regression tests: `test/dichiarazione.test.ts`'s `REG-005`.

- **`DEGIROParser` and `IBKRParser` silently dropped an entire trade row — not just its fee — when
  the fee-currency cell was blank on a row with a non-zero fee.** `Transaction costs currency`
  (DEGIRO) and `IBCommissionCurrency` (IBKR) are read independently from the trade's own currency
  column, and a blank cell was fed straight into the same ECB-rate lookup used for a genuinely
  unrecognized currency code — which always fails for an empty string — causing the row-skip
  branch to discard the whole transaction, principal included, not just the unresolved fee. A BUY
  dropped this way silently orphaned its matching SELL, which then threw `NO_OPEN_LOTS` on an
  otherwise perfectly valid round-trip trade; a dropped SELL instead silently understated
  `plusvalenze`/`minusvalenze` with no error at all. Both parsers now treat a **blank** fee-currency
  cell as a data-quality gap in a secondary field rather than an unresolvable currency: the fee is
  assumed to be denominated in the trade's own already-resolved currency (reusing the ECB rate that
  already succeeded for the trade's principal amount) and the row is kept, with a new
  `FEE_CURRENCY_ASSUMED` warning added so the assumption can be double-checked against the source
  broker export. A genuinely unsupported **non-blank** fee-currency code (e.g. `"XYZ"`) is
  unaffected and still drops the row with the pre-existing `UNSUPPORTED_CURRENCY`/`NO_ECB_RATE`
  warnings. New regression tests: `test/regression-degiro-blank-fee-currency.test.ts`,
  `test/regression-ibkr-blank-commission-currency.test.ts`.
- **Bucket B `netResult` could disagree by one cent with the Quadro RT export's
  `imponibileNetto` for the exact same tax year.** When a supplied `carryForward` entry's
  `amount` had more than 2 decimal places (nothing in the `CarryForward` type or docs requires
  cent precision — e.g. a figure carried over from an external FX-adjusted computation),
  `Calculator.calculateGains()` derived `report.bucketB.netResult` by rounding the total
  carry-forward consumed to cents *first* and only then subtracting that already-rounded total
  from the Bucket B gain/loss difference, while `report.dichiarazione.quadroRT.imponibileNetto`
  (computed by `buildQuadroRT()`) subtracted each entry's raw, unrounded consumed amount and
  rounded only once at the end — the correct approach for a chained monetary calculation, and the
  one `buildQuadroRT()` already used for its own carry-forward bookkeeping. The two roundings are
  not equivalent when the raw total needs a carry (e.g. carry-forward entries `10.005` and `10`
  sum to `20.005`, which IEEE-754 represents as `20.005000000000003` and rounds up to `20.01` in
  isolation, but not when subtracted raw as part of a larger total), so the same `GainsReport`
  could show two different taxable-base figures for the identical result — one of which a filer
  would submit via `dichiarazione.exportTo()`. `Calculator` now derives `bucketB.netResult` from
  the same raw, unrounded carry-forward accumulator it already maintained internally, matching
  `buildQuadroRT()`'s rounding discipline exactly. New regression test:
  `test/dichiarazione.test.ts`'s `REG-004`.

- **`Calculator.calculateGains()` threw a spurious `NO_OPEN_LOTS` error when closing a
  fractional-share position with a round-number SELL.** Real brokers (DEGIRO, IBKR) export
  fractional quantities already rounded to 8 decimal places; building a position out of several
  such BUYs and then closing it in one SELL entered as a round number (e.g. three
  `0.33333333`-share BUYs, summing to `0.99999999`, closed by a `1.00000000`-share SELL — exactly
  what a broker's own UI shows for "close full position") could leave a `~1e-8` residual once
  every open lot had been legitimately consumed. That residual was an order of magnitude coarser
  than the existing `QUANTITY_EPSILON` (tuned only for `~1e-17` IEEE-754 subtraction noise), so it
  survived and threw `NO_OPEN_LOTS` on a position that was, for all real-world purposes, fully and
  correctly closed. Added a separate, narrowly-scoped `SELL_CLOSE_TOLERANCE` (`5e-8`) checked only
  at the point where open lots are exhausted and a residual remains — several orders of magnitude
  below any genuine oversell (e.g. selling `0.01` shares more than were ever bought), which still
  throws exactly as before. New regression test:
  `test/regression-fractional-lot-fp-epsilon.test.ts`.

## [0.13.1] - 2026-09-16

### Added

- **Optional local model via Ollama for the ADK agent**: the agent's default model moves from
  ADK's own Gemini default to Anthropic Claude (`claude-sonnet-5`, via `MINUS_TRACKER_AGENT_MODEL`),
  with a second, strictly optional path to a local model through a running Ollama server (e.g.
  `ollama_chat/gemma4:e2b`) via ADK's `LiteLlm`. `litellm` is an opt-in extra
  (`pip install -e ".[ollama]"` / `uv sync --extra ollama`), never a base dependency, so the
  default Claude path needs zero Ollama/LiteLLM footprint. New: `agent/scripts/setup_ollama.sh`
  automates the opt-in path end to end (installs the extra, checks/guides installing the `ollama`
  CLI, pulls the model).
- **`agent/scripts/setup_and_run.sh`**: one-command setup + launch for the ADK agent — builds
  `minus-tracker-mcp`, installs the agent's Python dependencies, configures the model, and runs
  `adk web`, in one call. Two independent, freely combinable flags: `--ollama [model]` (default:
  Anthropic Claude) and `--mcp-remote <url>` (default: build/spawn a local MCP server). Fails
  fast on missing/invalid config (a bad `MINUS_TRACKER_MCP_TRANSPORT`, a missing
  `ANTHROPIC_API_KEY`, a missing `--mcp-remote` URL, one that looks like another flag, or one
  that's whitespace-only) before doing any real work. New: `agent/scripts/_defaults.sh`, the
  single source of truth for the default Ollama model (`gemma4:e2b`), sourced by both this script
  and `agent/scripts/setup_ollama.sh` so they can't silently disagree on it.

### Changed

- **README restructured into a docs/ wiki**: the root `README.md` had grown to 935 lines with
  near-duplicate Italian/English sections and inline version-history blurbs overlapping
  `CHANGELOG.md`. Detailed content split into focused English pages under `docs/` (quick-start,
  csv-formats, cli-usage, library-usage, mcp-server, faq); the root README is now a short
  bilingual intro, feature list, and links.
- **`agent/README.md` restructured**: Anthropic Claude vs. local Ollama, and local vs. remote MCP
  connection, are now both presented as explicit, symmetric up-front choices (comparison tables +
  labeled subsections) instead of one being the unstated default and the other an afterthought.
  Removed a reference to this private dev repo's `docs/prd/20-adk-agent.md` that was meaningless
  to an external reader of the now-public file.

### Fixed

- **Critical: the ADK agent routed a bare `claude-*` model id to the wrong SDK class.** ADK's own
  model registry maps a bare `claude-*` string to `anthropic_llm.Claude`, a Vertex-AI-only
  subclass requiring `GOOGLE_CLOUD_PROJECT`/`GOOGLE_CLOUD_LOCATION` — not the direct-API
  `AnthropicLlm` base class that reads `ANTHROPIC_API_KEY`, which is what the README documents
  and what was actually intended. As shipped, a user following the README verbatim hit a
  Vertex-AI credential error on the first real conversational turn instead of a working Claude
  conversation — model resolution is fully lazy, so the existing tests only asserted the attached
  string and never exercised `canonical_model`/the real client, missing this entirely.
  `build_agent()` now wraps a bare `claude-*` string in `AnthropicLlm` explicitly before it
  reaches `Agent`, bypassing the registry's default (wrong) routing — verified directly
  (`root_agent.model` is now an `AnthropicLlm` instance, isinstance-checked). Also fixes a
  `model or get_model()` truthiness bug (now `is None`).
- `agent/README.md`'s Option B (Ollama) install sequence would have double-installed the `ollama`
  extra — once via `uv sync --extra ollama`, again via `scripts/setup_ollama.sh` — surfaced while
  restructuring the model-choice docs. The script alone now owns that step;
  `uv sync --extra ollama` is documented only as its manual no-script alternative.
- `uv sync` installs the `adk` console script into `agent/.venv`, a project-local virtualenv it
  never adds to `PATH`. The agent README told users to type bare `adk run`/`adk web` right after
  `uv sync`, which failed with `command not found: adk` even though install succeeded. Now leads
  with activating the venv once per shell session, documents `uv run adk ...` as a no-activation
  fallback, and adds an explicit troubleshooting callout for the exact symptom.
- `lookupRate()`'s weekend/holiday walkback was hard-coded to 3 calendar days, but the bundled
  ECB snapshot (`src/data/ecb-rates.json`) has real calendar gaps of up to 5 days around
  recurring TARGET2 (eurozone) holiday closures — notably Easter (Good Friday + Easter Monday,
  both TARGET2 holidays, bracketing a weekend) and the Christmas/New Year cluster. Confirmed
  gap: the bundled USD rate has no entry from 2024-03-28 (Thu) through 2024-04-01 (Mon, Easter
  Monday) inclusive. Easter Monday is _not_ a US market holiday (NYSE is open), so an ordinary
  USD-denominated trade of a US stock placed on 2024-04-01 is real, valid, and taxable — but the
  old 3-day window couldn't bridge the 4-calendar-day distance back to 2024-03-28's rate,
  `lookupRate()` returned `null`, and `DEGIROParser`/`IBKRParser` silently dropped the row (a
  `NO_ECB_RATE` warning, not an error) — potentially discarding a same-ISIN SELL that would
  otherwise have matched an open lot, and with it a real plusvalenza/minusvalenza, from the tax
  report entirely. The walkback window is now `MAX_LOOKBACK_DAYS = 5` calendar days, wide enough
  to bridge the worst real gap observed in the bundled snapshot (5 days, so at most 4 days of
  backward search from any date inside it) with one full day of safety margin, while remaining
  far short of a "no rate anywhere nearby" case, which still correctly resolves to `null`. New
  regression test: `test/regression-degiro-easter-gap-fx.test.ts`.
- `agent/scripts/setup_and_run.sh`'s local MCP setup previously called `npm link`/
  `npm install -g` to put `minus-tracker-mcp` on `PATH`, which needs write access to npm's global
  directory — a real, reported failure (`npm error EACCES ... symlink ...
/usr/local/lib/node_modules`) on Node installs outside a version manager like nvm. It no longer
  calls either:
  instead it builds (`npm ci && npm run build`) and points `MINUS_TRACKER_MCP_COMMAND` directly
  at the built `dist/mcp/index.js`'s own path — the same escape hatch `agent/tests/conftest.py`'s
  `mcp_server_command` fixture already used for the identical reason. `MINUS_TRACKER_MCP_ARGS` is
  deliberately not used alongside it: `config.py`'s `get_connection_params()` splits that value on
  whitespace, which would silently break on any checkout path containing a space (a real, common
  case — a "John Smith"-style home folder, an iCloud Drive/OneDrive sync path), confirmed via a
  live repro; the built file's own shebang makes a separate args list unnecessary. A user-set
  `MINUS_TRACKER_MCP_COMMAND` is now always respected and never overwritten, and an existing build
  is detected by the built file's presence (not requiring it to already be on `PATH`) so a repeat
  run doesn't pay for a fresh `npm ci` every time.

## [0.13.0] - 2026-09-14

### Added

- **`calculate_from_csv` and `check_rate_coverage` MCP tools** (Part 19, Tasks 64-66): two new
  tools registered on `minus-tracker-mcp`, closing the LLM data round-trip risk in Part 15's
  original `parse_transactions` -> `classify_instruments` -> `calculate_gains` sequence, where an
  LLM-orchestrated caller has to reproduce a parsed `Transaction[]` array verbatim as the next
  tool call's argument.
  - `calculate_from_csv` is a direct in-process composition of the three existing handlers — parse
    a DEGIRO CSV, auto-classify every ISIN, then calculate gains — so a caller only ever relays the
    original CSV text across tool-call boundaries. Supports `overrides`/`offline` (forwarded into
    the classify step) and `carryForward` (forwarded into the calculate step, and required again on
    any retry — this tool is fully stateless); `incomeRows` from the parse step is wired into the
    calculate step automatically. Returns `{ report, warnings, unresolvedIsins }`; an unresolved
    ISIN defaults to Bucket B (the same best-effort behavior `calculate_gains` already has) rather
    than failing the call, with `unresolvedIsins` telling the caller which ISINs to retry with
    `overrides`. Its `extra` (`progressToken`/`sendNotification`) is forwarded unchanged into the
    inner classify step, so multi-batch OpenFIGI progress notifications fire exactly as they would
    for a direct `classify_instruments` call. Error shapes (`ParseError`/`ClassificationError`/
    `CalculationError`) are identical to the three composed tools by construction — this handler
    reuses their exact error-mapping functions rather than any new mapping of its own.
  - `check_rate_coverage` is a read-only equivalent of `rates --check`: per-currency ECB rate date
    coverage (`{ from, to }`) plus the actual missing-date list within it, for the bundled +
    user-merged snapshot, with an optional `currencies` filter. Never touches the network or the
    filesystem (unlike `rates --update`, deliberately not exposed as a tool). Backed by a new
    shared `getCurrencyCoverage()` in `src/rates/index.ts` — a superset of the private, per-
    currency-gap-count-only `getCoverage()` the CLI's `rates --check` used to compute on its own;
    that CLI command now consumes the same shared function instead of duplicating the scan.
  - New: `src/mcp/tools/calculate-from-csv.ts`, `src/mcp/tools/check-rate-coverage.ts`,
    `test/mcp/calculate-from-csv.test.ts`, `test/rates/coverage.test.ts` (TC-233–244). Extended:
    `src/mcp/server.ts` (both tools registered, schema-validated like the existing 3),
    `test/mcp/protocol.test.ts` (TC-115 updated for 5 registered tools; new TC-245). No changes to
    the frozen public API (`DEGIROParser`/`Calculator`) or to any existing tool's behavior/schema.
- `minus-tracker-mcp` gains a second, opt-in transport alongside the default stdio one (Part 19,
  Task 67): `--transport stdio|sse` (default `stdio`, unchanged behavior for every existing
  caller — including one passing flags this binary doesn't itself define, which are now tolerated
  rather than causing a startup crash), `--port <n>`, and `--host <address>`. SSE mode binds to
  `127.0.0.1` by default — never `0.0.0.0` — and only binds elsewhere when `--host` explicitly
  says so, since SSE mode has no authentication and these tools operate on real financial
  transaction data. The listener enables the SDK's DNS-rebinding protection
  (`enableDnsRebindingProtection`/`allowedHosts`), rejecting requests whose `Host` header doesn't
  match the bound address (or `localhost`, for the default bind) with `403`, even when the
  underlying TCP connection legitimately reaches the loopback bind. The server stays stateless
  regardless of transport — each HTTP request gets its own `Server`/`StreamableHTTPServerTransport`
  pair, per the SDK's documented stateless-mode pattern. New E2E coverage:
  `test/mcp/e2e-sse.test.ts` (TC-246, TC-247, TC-248, plus regression guards for the DNS-rebinding
  mitigation and for argv robustness in stdio mode).
- **`agent/` — ADK Python agent scaffold** (Part 20, Tasks 68-69): a Python subproject, sibling to
  `src/`, that is a pure `MCPToolset` client with zero bespoke tool-calling code — never imported
  by or bundled into the npm build. A single `LlmAgent` wires an `McpToolset` whose stdio/sse
  connection is fully environment-driven (`MINUS_TRACKER_MCP_TRANSPORT`, `MINUS_TRACKER_MCP_URL`,
  `MINUS_TRACKER_MCP_COMMAND`/`MINUS_TRACKER_MCP_ARGS`), mirroring `src/errors.ts`'s discriminated-
  code convention for its one misconfiguration error (`AgentConfigError`) instead of leaking a raw
  pydantic `ValidationError`. Tools are auto-derived by `McpToolset` from the running server's own
  `tools/list` response — this file has zero bespoke tool-calling code to keep in sync as the
  server's tool surface evolves. New: `agent/pyproject.toml`, `agent/minus_tracker_agent/`,
  `agent/tests/test_tool_discovery.py` (TC-249, TC-251), `agent/tests/test_smoke.py` (TC-250, an
  end-to-end `calculate_from_csv` call against a locally-spawned `minus-tracker-mcp`, offline and
  deterministic).

### Fixed

- `DEGIROParser` silently mis-priced a transaction's fee whenever the "Transaction costs
  currency" column was not EUR: the raw numeric value of "Transaction costs" was used
  verbatim as `feesEUR`, completely ignoring what currency it was actually billed in — no
  ECB conversion, no warning. This is a real DEGIRO scenario (e.g. an FX/connectivity
  surcharge billed in a currency different from the trade's own "Local value currency")
  and produced a silently wrong `plusvalenza`/`minusvalenza` by the fee's FX delta —
  `IBKRParser` already handled the equivalent `IBCommission`/`IBCommissionCurrency`
  columns correctly, so the two parsers disagreed on identical underlying data.
  `DEGIROParser` now performs an independent ECB rate lookup for "Transaction costs
  currency" (same `lookupRate()`/3-trading-day-walkback semantics already used for the
  trade side), converts the fee to EUR, and — mirroring `IBKRParser`'s commission-FX
  handling exactly — stamps the pre-existing optional `Transaction.feesFxRate`/
  `feesCurrency` fields only when the fee currency differs from the trade currency. A fee
  currency with no ECB rate available for its date (or not supported at all) now skips the
  row with a `NO_ECB_RATE`/`UNSUPPORTED_CURRENCY` warning instead of silently mis-pricing
  it, consistent with how the trade-side currency already fails. New regression coverage:
  `test/regression-degiro-nonEUR-fee-fx.test.ts`. No public signatures changed —
  `DEGIROParser`, `Calculator.calculateGains`, `IBKRParser`, and `Classifier` are
  unaffected; `Transaction.feesFxRate`/`feesCurrency` already existed in the type and were
  already read by `Calculator`.

- The shipped `stress-test` CLI command misreported 4 of its 100 built-in scenarios (`033`,
  `074`, `075`, `095`) as failing on a clean, correct build. All four exercise an ordinary
  "bought in an earlier year, sold in a single later year" holding — ISIN, per-year the SELLs are
  entirely unambiguous, no `AMBIGUOUS_TAX_YEAR` case — for which `Calculator.calculateGains()` has
  correctly emitted zero warnings since the v0.11.2 tax-year-inference redesign (only SELL dates
  are consulted; a BUY-only year spread never triggers ambiguity, regression-guarded by TC-173/
  TC-179). `src/data/stress-manifest.json` was never updated when that redesign shipped and still
  asserted the old, since-removed "multi-year warning" behavior (`warning_count: 1`), so
  `minus-tracker stress-test` failed out of the box even though the underlying calculation was
  correct. The four scenarios' `warning_count` now correctly reads `0`; the two that were
  miscategorized as `10-warnings` (`074`, `075`, since they no longer warn) are recategorized to
  `12-edge-cases` with slugs/descriptions that describe current behavior instead of the removed
  one. `test/TC-043.test.ts` gained a hardcoded, real-`Calculator`-backed regression test for these
  four scenarios plus a broader in-process check that cross-validates every runnable manifest
  scenario's declared `warning_count` against actual `Calculator`/`DEGIROParser` output, so a
  future manifest/behavior drift fails `npm test` directly instead of only surfacing via a manual
  `stress-test` run. No calculation logic changed; `DEGIROParser`, `Calculator.calculateGains`,
  `IBKRParser`, and `Classifier` signatures are unaffected.

## [0.12.0] - 2026-09-05

### Added

- **CLI color output**: `calc`, `validate`, `classify`, `rates`, `config`, and `stress-test` now
  render colorized terminal output — green for plusvalenze/gains, red for minusvalenze/losses and
  hard errors, amber for warnings/notes, navy for table headers and section labels — sharing one
  set of truecolor ANSI primitives (`src/cli/colors.ts`, extracted from the existing `banner.ts`
  gradient logic) and a `Segment`-based renderer (`src/cli/renderer.ts`) that always computes
  column padding on plain text _before_ wrapping it in color, so ANSI escape bytes are never
  counted toward a width calculation. A new `--no-color` flag forces plain output; resolution
  order is `--no-color` > `NO_COLOR` env var > non-TTY stdout > color on, so piped/redirected
  output and CI logs stay uncolored automatically without any flag. Hard errors across
  `calc`/`validate`/`classify` now share one red-coloring error-rendering path. Zero new runtime
  dependencies, consistent with this project's minimal-dependency convention.
- `config --reset`: deletes the persisted `config.json` (the file `config --lang` writes to
  `$XDG_CONFIG_HOME/minus-tracker/config.json`, or the platform equivalent), clearing any saved
  locale override so the next `resolveLocale()` call falls through to the `MINUS_TRACKER_LANG`
  env var, or the `it` default, exactly as if `--lang` had never been run. Deleting an
  already-absent `config.json` is a no-op (exit 0, no error) via a try/catch-ignore around
  `fs.unlinkSync`, matching this CLI's existing idempotent-command style. `--reset` only ever
  touches `config.json`; the separate `carryforward.json` sidecar (`calc --carry-forward`'s
  config-file source) is untouched. `--reset` is mutually exclusive with `--lang`/`--show` —
  combining either with `--reset` is a usage error (exit 2), consistent with how `config` already
  rejects other invalid invocations.
- `Transaction.sourceRow`: an optional 1-indexed CSV row number, stamped by both
  `DEGIROParser`/`IBKRParser` (same numbering as the existing `WarningEntry.row`), and a new
  internal `parseMultipleFiles()` pipeline (`src/cli/multi-file.ts`) that parses N CSV files —
  resolving duplicate resolved paths as a usage error, running each file's existing broker
  detection/parsing unchanged, concatenating the results in file-argument order, and scanning for
  cross-file duplicate-looking rows (same ISIN/date/type/quantity/price/currency across two
  _different_ source files) which are warned about, using `sourceRow`, but never dropped. This is
  the shared multi-file plumbing `calc`/`validate`/`classify`'s upcoming N-file support builds on;
  no existing single-file behavior changes.
- `CalculatorOptions.taxYear`: `Calculator.calculateGains()` now scopes its report to an explicit
  tax year. `taxYear` is applied _after_ lot matching — the full input still informs matching
  (e.g. an out-of-scope SELL still consumes the lot it's chronologically owed), only the final
  `plusvalenze`/`minusvalenze`/`bucketA`/`bucketB`/`dichiarazione` totals are filtered to
  `sellDate`s in that year. Tax-year _inference_ (when `taxYear` is omitted) is corrected to
  count SELL dates only, not BUY dates — a portfolio bought across several years but sold entirely
  in one is no longer misreported as spanning multiple years. When SELLs genuinely span more than
  one calendar year and `taxYear` is omitted, `calculateGains()` now throws `CalculationError`
  with the new `.code === "AMBIGUOUS_TAX_YEAR"` (`.years`, ascending) instead of silently blending
  years into one report; the old `warnMultipleYears` warning (whose trigger condition this throw
  now fully supersedes) has been removed. `CalculationError.isin`/`.date` are consequently optional
  (present only for the pre-existing `NO_OPEN_LOTS` code).
- CLI: `calc`, `validate`, and `classify` all accept one or more positional CSV files
  (`<file.csv> [file2.csv ...]`), parsed and merged via `parseMultipleFiles()`. Single-file
  invocations are byte-for-byte unchanged. With more than one file: a new `--sidecar <path>` flag
  becomes required (previously always auto-derived from the single input file); `calc`'s
  `--export-dichiarazione`'s bare-flag auto-derive convenience is limited to single-file input (an
  explicit path is required for N>1); `--broker` applies uniformly to every file when given,
  otherwise each file auto-detects its own broker independently (mixed-broker merges); `validate`
  renders one tagged block per file followed by a blank line and a `validateTotal` aggregate
  (transaction count and total warnings, including cross-file duplicate-row warnings); `classify`
  dedupes ISINs across the merged file list before OpenFIGI lookup, using its existing single-list
  dedup logic unchanged. `calc --year <YYYY>` now actually scopes the report via
  `CalculatorOptions.taxYear` (previously a no-op) and renders the new `AMBIGUOUS_TAX_YEAR` error
  via `errorAmbiguousTaxYear` (exit 1) when omitted and needed. Six new locale keys support this:
  `errorAmbiguousTaxYear`, `multiFileTag`, `errorDuplicateFilePath`,
  `errorMultiFileOutputRequired`, `warnDuplicateRow`, `validateTotal`.

### Fixed

- `IBKRParser` silently ignored the optional `Multiplier` column on `Trades` rows. Real IBKR
  Activity Flex Query exports for non-stock `AssetCategory` values — most importantly `OPT`
  (equity/index options) and `FUT` (futures), both explicitly in scope per
  `docs/prd/16-ibkr-parser.md`'s "STK, OPT, FUT, BOND, etc." — carry a `Multiplier` column: the
  number of underlying units one traded contract represents (typically `100` for a standard
  US/EU equity option). `TradePrice` on those rows is quoted **per underlying unit** (e.g. the
  option premium per share), not per contract, so the real cash value of the trade is
  `quantity * multiplier * tradePrice` — but `parseTradesRow()` computed `totalLocal` as plain
  `quantity * tradePrice`, with zero references to `Multiplier` anywhere in the parser. For any
  row where the real multiplier wasn't `1`, the resulting `totalLocal`/`totalEUR` — exactly what
  `Calculator.calculateGains()` uses as cost basis / sale proceeds — was silently wrong by that
  factor, with no warning and no error. A reproduction using one SAP call-option contract
  (multiplier 100, bought for a 2.50 EUR/share premium plus 1 EUR commission, then sold two
  months later for a 4.00 EUR/share premium minus 1 EUR commission) has real economics of a
  +148 EUR gain (`1 * 100 * 2.50 + 1 = 251` EUR cost vs. `1 * 100 * 4.00 - 1 = 399` EUR proceeds),
  but the unpatched parser reported `transactions[].totalEUR` as `2.5`/`4` (ignoring the
  multiplier entirely) and the resulting `MatchedLot.gainLossEUR` as `-0.5` — a **0.50 EUR loss**
  reported on a trade that was actually a **148 EUR gain**, with the sign flipped and the
  magnitude off by two orders of magnitude. `parseTradesRow()` now reads the optional `Multiplier`
  column via the same `get()`/`parseNumericField()` pattern already used for every other numeric
  column, folding it into `totalLocal` only (`quantity * multiplier * tradePrice`) — `TradePrice`
  itself, and therefore `Transaction.pricePerUnit`, is left untouched, since that field must keep
  meaning the raw per-unit price as it appears in the source row (used for CSV-row dedup/display
  in `src/cli/multi-file.ts`). `Multiplier` remains a strictly optional column — it was **not**
  added to `TRADES_REQUIRED_COLUMNS` — and a missing column, blank cell, non-numeric value, zero,
  or a negative value all default the multiplier to `1` (today's behavior for plain-stock rows)
  rather than throwing or warning, so every existing `Trades` row shape (including all rows in the
  test suite that omit the `Multiplier` column entirely) parses byte-for-byte identically.
  `DEGIROParser`, `Calculator.calculateGains()`, `IBKRParser`, and `Classifier` signatures are
  unchanged. Found by the automated adversarial QA routine.
- `IBKRParser` cast the `Buy/Sell` column of a `Trades` row directly to the `"BUY" | "SELL"`
  `Transaction.type` union (`get("Buy/Sell") as "BUY" | "SELL"`) with no runtime validation that
  the CSV field actually held one of those two literals. Any other value (e.g. `"Buy"` instead of
  the documented `"BUY"`) silently flowed into a `Transaction` with a nonconforming `type`. Because
  `Calculator.calculateGains()`'s lot-matching loop treats anything not exactly `"BUY"` as a
  `SELL`, a malformed purchase row was silently miscategorized as a disposal: a synthetic
  reproduction (a real `BUY` of 20 shares followed by a second purchase of 10 more shares whose
  `Buy/Sell` field read `"Buy"`) produced a fabricated €88.18 plusvalenza — a phantom taxable gain
  for a security that was never sold — with **zero warnings and no error**. A simpler case (a bad
  value on the first row for an ISIN, no prior open lot) instead threw a confusing
  `CalculationError` blaming "no open lots" on what was actually meant to be the opening `BUY`.
  `IBKRParser.parseTradesRow()` now validates `Buy/Sell` with an explicit equality guard
  (`rawType !== "BUY" && rawType !== "SELL"`) immediately after reading the field, before it is
  used to build a `Transaction` or determine `totalLocal`'s sign; a non-conforming value is
  skipped with a new `INVALID_BUY_SELL` warning (naming the row and the offending raw value) and
  no `Transaction` is produced for that row, consistent with how this same parser already handles
  other malformed rows (`MISSING_ISIN`, `QUANTITY_ZERO`, `UNSUPPORTED_CURRENCY`, `NO_ECB_RATE`).
  `DEGIROParser`, `Calculator.calculateGains()`, `IBKRParser`, and `Classifier` signatures are
  unchanged; `DEGIROParser` was not affected (it already derives `BUY`/`SELL` from the signed
  `Quantity` field, not free-text). Found by the automated adversarial QA routine.
- `buildQuadroRT` (the Quadro RT builder behind `report.dichiarazione` / `--export-dichiarazione`
  / the `calculate_gains` MCP tool) could report a Bucket B loss-carryforward breakdown
  (`quadroRT.carryForwardApplied`) whose line items summed to MORE than the amount actually
  applied — and, worse, more than there was Bucket B gain (`differenza`) to offset in the first
  place. This happened because each carry-forward entry's consumed amount was rounded to cents
  **independently** (`roundHalfUp(consumed)`) when building the display breakdown, while the
  separately-computed authoritative total (`report.bucketB.carryForwardApplied`, in
  `Calculator.calculateGains()`) sums every entry's _unrounded_ consumption first and rounds only
  **once**. Since `roundHalfUp` is not linear, several entries whose fractional-cent consumption
  each independently rounds up (e.g. three `0.335` EUR carry-forward entries fully absorbing a
  `1.00` EUR gain) could display as `0.34 + 0.34 + 0.33 = 1.01` — one cent more than was ever
  applied or available, and disagreeing with `report.bucketB.carryForwardApplied` (`1.00`) inside
  the very same `GainsReport`. `buildQuadroRT` now derives each entry's displayed `importo` from
  the delta between two roundings of a running unrounded total (`roundHalfUp(cumulativeConsumed)
  - previousCumulativeRounded`), which telescopes by construction so the displayed line items
  always sum to exactly `roundHalfUp(total unrounded consumption)` — the same figure
  `Calculator.calculateGains()` reports as `bucketB.carryForwardApplied` — instead of drifting
  above it. Each entry's own `consumed`/residual bookkeeping (driving `remaining` and
  `carryForwardRiportato`) is untouched and stays on unrounded amounts throughout, so
  `Calculator`'s own `bucketB.carryForwardApplied`, `carryForwardRemaining`, and
  `carryForwardEntriesRemaining` outputs are unaffected. `DEGIROParser`, `IBKRParser`,
  `Calculator.calculateGains()`, and `Classifier` signatures are unchanged.

- `Calculator.calculateGains()` could leak raw IEEE-754 floating-point noise into the public
  `MatchedLot.quantity` field for a fractional-share position closed across multiple partial
  lot matches (e.g. a `0.5`-share and a `0.7`-share `BUY` partially closed by a `0.9`-share
  `SELL`): the second matched lot's `quantity` came out as `0.20000000000000007` instead of the
  clean `0.2` the user actually traded, because `0.9 - 0.7` is not exactly representable in
  double-precision floating point. The existing `QUANTITY_EPSILON` guard (from a prior fix) only
  snapped a residue to exactly `0` when it was very close to zero — a non-zero-but-noisy residue
  like this one passed through untouched and flowed straight into the next lot-matching
  iteration's `Math.min(lot.quantity, remainingSellQty)`, which is pushed verbatim into
  `matchedLots[].quantity`. This was silently wrong data in the frozen public API
  (`GainsReport.lots[]`) and directly visible to end users: the CLI's `calc` command prints
  `lot.quantity` raw in its results table, so a real fractional-share portfolio closed across
  multiple sells rendered a garbled quantity column and broke the table's fixed-width alignment.
  A new `roundQty()` helper now snaps every lot/remaining/matched quantity to 8 decimal places
  (comfortably covering real broker fractional-share precision, which tops out around 6–8
  decimals, while being many orders of magnitude coarser than the ~1e-15–1e-17 noise a single
  subtraction introduces) at each point in the lot-matching loop, including the value assigned
  to `matchedQty` itself — so the fix also covers a caller supplying an already-noisy
  `Transaction.quantity` directly (e.g. from `0.1 + 0.2`-style arithmetic before constructing the
  transaction), not just noise accumulated internally by the loop. Genuine oversells (selling more
  than was ever bought) and the existing "lot fully closes to exactly zero" behavior are
  unaffected — a real quantity mismatch is always many orders of magnitude larger than the 8th
  decimal place. `DEGIROParser`, `IBKRParser`, `Calculator.calculateGains()`, and `Classifier`
  signatures are unchanged.

- The CLI's `calc`, `validate`, and `classify` commands returned exit code 2
  ("`Impossibile rilevare il formato del broker`" / "broker detection failed") instead of the
  documented exit code 1 ("`CSV non valido: impossibile analizzare il file`" / invalid CSV) when
  given genuinely invalid or binary CSV content (e.g. a file containing a NUL byte, or otherwise
  unparseable garbage) without an explicit `--broker` flag. This was a regression from v0.11.0's
  broker auto-detection: `detectBroker()` is a deliberately cheap format sniff — it only checks
  for DEGIRO's `"Local value currency"` header column or an IBKR `"Trades,Header,"` line, and
  returns `null` for anything else — but it was never able to distinguish "not a recognized
  broker format" from "not valid CSV at all". Since all three commands short-circuited on a
  `null` broker result before ever instantiating `DEGIROParser`/`IBKRParser` (which would
  otherwise reject invalid content with their own documented `ParseError("INVALID_CSV")` → exit
  1 contract), invalid/binary input was silently misreported as an unrecognized broker instead.
  This was caught by minus-tracker's own shipped `stress-test` suite (scenarios `076`/`077`,
  category `11-errors`), which expects exit 1 for exactly this content and was failing on `main`.
  A new shared helper (`checkCsvValidity()` in `src/parser/validity.ts`) now performs the
  structural "is this even parseable CSV" check — the same NUL-byte/binary-garbage heuristic and
  empty-parse check `DEGIROParser` and `IBKRParser` already used internally, now de-duplicated
  into one implementation both parsers call. `calc`/`validate`/`classify` consult this same
  helper only when `detectBroker()` returns `null`, so a well-formed CSV that simply isn't
  DEGIRO- or IBKR-shaped still correctly reports "broker detection failed" (exit 2) without ever
  instantiating a parser, while structurally invalid content now correctly reports "invalid CSV"
  (exit 1) instead. `DEGIROParser`, `IBKRParser`, `Calculator.calculateGains()`, and `Classifier`
  signatures and thrown-error contracts are unchanged.

- `Calculator.calculateGains()` filtered `IncomeRow`s (dividends/coupons) into the current tax
  year's `dichiarazione.quadroRM` using `new Date(row.date).getFullYear() === taxYear`.
  `row.date` is a plain ISO `"YYYY-MM-DD"` string, and `new Date()` parses a date-only string as
  UTC midnight — but `.getFullYear()` reads the year back in the **host machine's local
  timezone**, not UTC. In any timezone with a negative UTC offset (e.g. `America/New_York`,
  UTC-5), an income row dated exactly `"2024-01-01"` was reinterpreted as local time
  `"2023-12-31 19:00"`, so `.getFullYear()` returned `2023` instead of `2024`. The row then
  silently failed the tax-year filter and was dropped from `quadroRM.dividendiEsteri`/`.cedole`,
  with a misleading `"Income rows outside tax year ... were skipped."` warning pushed even
  though the dividend or coupon genuinely belonged to that tax year — understating foreign
  income on the exported Modello Redditi PF depending purely on which timezone the calculation
  happened to run in, with no change to the input data. The filter now extracts the year via
  plain string slicing (`row.date.slice(0, 4)`), the same timezone-independent pattern already
  used by `inferTaxYear()` a few lines above in the same file, instead of constructing a `Date`
  object at all. `Calculator.calculateGains()`'s signature and the frozen public API are
  unchanged.

- `DEGIROParser` and `IBKRParser` read every numeric CSV cell (`Quantity`, `Price`/`TradePrice`,
  `Local value`, `Transaction costs`/`IBCommission`, and `Amount` in the `Dividends`/
  `Withholding Tax`/`Interest` sections) via a bare `parseFloat()` call. `parseFloat` parses only
  a leading numeric prefix and silently ignores everything from the first unparseable character
  onward, so a perfectly valid, RFC-4180-quoted cell using a comma as a thousands separator (e.g.
  `"2,500"` for 2,500 shares — something spreadsheet software commonly produces when re-saving a
  CSV with a number-formatted column) was silently read as `2`, a 1000x+ quantity/amount
  corruption with no warning or error. Depending on the surrounding transactions, this either
  produced a confusing `CalculationError: No open lots` on an entirely ordinary partial sale of
  the position, or — worse — silently reported a wrong quantity and per-share price with no
  error at all. A new `parseNumericField()` helper (`src/parser/numeric.ts`) now validates the
  full trimmed cell against either a plain-number or a strict 3-digit-grouped-thousands pattern
  before parsing, correctly normalizing `"2,500"` to `2500` while still returning `NaN` — exactly
  as a bare `parseFloat` always did — for genuinely non-numeric or malformed-grouping input (e.g.
  `""`, `"abc"`, or a bogus grouping like `"1,2,3"`), so no existing blank/garbage-field
  validation is weakened.

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

- `buildQuadroRT` (the Quadro RT builder behind `report.dichiarazione` / `--export-dichiarazione`
  / the `calculate_gains` MCP tool) silently dropped any caller-supplied Bucket B `carryForward`
  entry that was not fully consumed by the current tax year, in every case except a straightforward
  net gain: a partially-consumed entry (e.g. only 800 of a 1200 EUR prior-year loss needed to
  offset this year's gain) lost its unconsumed 400 EUR balance entirely, and when the current
  year's Bucket B result was break-even or a net loss, _all_ supplied `carryForward` entries were
  dropped outright regardless of whether they were still within their 4-year window — the
  function only ever consulted `carryForward` in its `differenza > 0` branch. This did not affect
  `Calculator`'s own `report.bucketB.carryForwardEntriesRemaining`, which already tracked
  unconsumed balances correctly, but it did mean the actual exported Quadro RT (the document a
  user would file) understated or omitted legitimate minusvalenze carryforward, which could cause
  a user to overpay capital-gains tax in a future year. `buildQuadroRT` now computes
  `carryForwardRiportato` in a single pass across all three `differenza` signs, mirroring
  `Calculator`'s existing oldest-first consumption order: every unexpired supplied entry's
  unconsumed residual is preserved, plus a new entry for the current tax year's own loss when
  applicable. `carryForwardApplied` and the frozen public API are unchanged.

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
