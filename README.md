# minus-tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Open-source TypeScript library + CLI that automates **Italian capital-gains/loss calculation**
for the _Regime Dichiarativo_ — LIFO/FIFO lot matching, multi-currency normalization (historical
ECB rates), and broker-CSV parsing — turning raw trades into _plusvalenze_/_minusvalenze_ ready
for a commercialista.

> **Status:** Pre-spec bootstrap. The engine is being specced and built via the workflow in
> `.claude/commands/` (`spec_brainstorm` → `write_test_plan` → `write_impl_plan` →
> `do_impl_plan`). See [`docs/idea.md`](./docs/idea.md) for the vision.

## What it does

- Core capital-gains calculation — **LIFO and FIFO** lot matching (configurable)
- **DEGIRO CSV parser** (extensible to other brokers via community PRs)
- **Multi-currency** handling with historical ECB rates (EUR, USD, GBP, CHF)
- Italian terminology: _plusvalenze_ (gains), _minusvalenze_ (losses)
- **Agenzia Entrate FAQ** test cases as the correctness baseline
- CLI tool + programmatic API

## Intended API

```ts
import { DEGIROParser, Calculator } from "minus-tracker";

const transactions = new DEGIROParser().parse(csv);
const report = new Calculator(transactions).calculateGains("LIFO"); // or "FIFO"
```

minus-tracker is **pure tax math** — no UI, auth, database, or PDF. It is the standalone engine
behind [Olos](https://github.com/gabrielerandelli/Olos)'s Tax Hub, but works independently.

## Installation

```bash
npm install minus-tracker
```

_(Not yet published — coming with v0.5.0.)_

## Disclaimer

A **calculation aid, not tax advice**. Outputs are intended for review/handoff to a qualified
commercialista.

## License

[MIT](./LICENSE) © 2026 Gabriele Randelli
