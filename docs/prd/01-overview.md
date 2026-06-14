# Part 1 — Overview

## What it is

Standalone TypeScript library + CLI that turns DEGIRO trade exports into Italian
_plusvalenze_/_minusvalenze_ reports for the _Regime Dichiarativo_.

## In scope (v0.5.0)

- LIFO and FIFO lot matching (configurable, default LIFO)
- Multi-currency normalisation via bundled ECB historical rates (EUR, USD, GBP, CHF)
- DEGIRO CSV parser (Account Statement format)
- Asset classes: **stocks and ETFs only**
- Tax year scope: **single year** — caller filters input; library calculates whatever is in the file
- Full audit trail output (per-lot detail + rates used + warnings)
- CLI: `calc`, `validate`, `rates` commands
- npm package + programmatic API

## Out of scope (v0.5.0)

- Capital-loss carryforward across years (4-year Italian rule)
- IBKR / Trading 212 / other broker parsers
- Bonds, options, futures, crypto, ETPs
- Web UI or PDF rendering
- Multi-year tax reports

## Success metrics

1. npm package published; consumed by Olos Tax Hub via `import { DEGIROParser, Calculator }`
2. All Agenzia Entrate FAQ test cases pass (see [Part 8](08-correctness.md))
3. First external community PR (additional broker parser)

## Constraints

- Zero mandatory runtime dependencies (ECB rates bundled; no network at runtime)
- Tree-shakeable: consumers who only import `Calculator` do not bundle the parser
- Outputs and docs use Italian domain terminology (_plusvalenze_, _minusvalenze_)
- All user-facing text must include: _"minus-tracker è un ausilio al calcolo, non consulenza fiscale."_
