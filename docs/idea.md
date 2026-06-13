# minus-tracker — Idea & Vision

**Status:** Pre-spec bootstrap (v0.5.0, June 2026)

---

## The Core Idea

**minus-tracker** is an open-source TypeScript library + CLI that automates Italian
capital-gains/loss calculation for the _"Regime Dichiarativo"_ — LIFO/FIFO lot matching,
multi-currency normalization, and broker-CSV parsing — turning raw trades into
_plusvalenze_/_minusvalenze_ ready for a commercialista. It is the standalone tax engine that
powers Olos's Tax Hub, but is usable independently via npm or the CLI.

---

## Why It Matters

The Italian Regime Dichiarativo is complex and commercialista fees are high (€500–2,000/yr).
There is no open, auditable, Italian-focused tax-math library. minus-tracker fills that gap:

- Correct **LIFO/FIFO** lot matching
- Historical-ECB **multi-currency** (EUR, USD, GBP, CHF)
- An **Agenzia Entrate FAQ**-backed correctness suite
- Open source, auditable, and free

---

## What It Does

- **Core capital-gains calculation** — LIFO and FIFO lot matching (configurable)
- **DEGIRO CSV parser** (extensible to other brokers via community PRs)
- **Multi-currency handling** with historical ECB rates (EUR, USD, GBP, CHF)
- **Italian terminology** in outputs: _plusvalenze_ (gains), _minusvalenze_ (losses)
- **Agenzia Entrate FAQ test cases** as the correctness baseline
- **CLI tool + programmatic API** (npm); Italian documentation

---

## Public API (the contract Olos integrates against)

```ts
import { DEGIROParser, Calculator } from "minus-tracker";

const transactions = new DEGIROParser().parse(csv);
const report = new Calculator(transactions).calculateGains("LIFO"); // or "FIFO"
```

The package is **pure tax math**: no UI, no auth, no database, no PDF rendering.

---

## Relationship to Olos

Separation of concerns:

- **minus-tracker** = the tax engine (LIFO/FIFO, multi-currency, broker parsing)
- **Olos** = UI, authentication, encryption, archival, PDF — it consumes minus-tracker as a
  dependency

minus-tracker stands alone and **ships first**; Olos's Tax Hub is its first consumer.

---

## Roadmap (v0.5.0, ~9h)

| Week | Focus                        | Ship                         |
| ---- | ---------------------------- | ---------------------------- |
| 1    | Core LIFO/FIFO logic + tests | —                            |
| 2    | CLI + npm packaging          | ✅ npm package + GitHub repo |

---

## Included / Not Included (v0.5.0)

**Included:**

- Core LIFO/FIFO calculation
- DEGIRO CSV parser
- Multi-currency handling with historical ECB rates
- Agenzia Entrate FAQ test suite
- CLI tool + npm package
- Italian documentation

**Not included now:**

- IBKR / Trading212 parsers (community PRs later)
- Web demo (the npm package is sufficient)
- Capital-loss carryforward and other EU countries (future)

---

## Success Metrics

- npm package published; consumed by Olos's Tax Hub
- Test suite passes all Agenzia Entrate FAQ cases
- First external community contribution (an additional broker parser)

---

## Disclaimer

minus-tracker is a **calculation aid, not tax advice**. Its outputs are intended for review and
handoff to a qualified commercialista.
