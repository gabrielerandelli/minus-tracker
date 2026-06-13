# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**minus-tracker** is a standalone, open-source **TypeScript npm library + CLI** that automates
Italian capital-gains/loss calculation for the _Regime Dichiarativo_. It is **pure tax math** —
no UI, no auth, no database, no PDF. It ships independently and is the engine behind
[Olos](https://github.com/gabrielerandelli/Olos)'s Tax Hub (Olos consumes it as a dependency).

Core scope (v0.5.0):

- LIFO/FIFO lot matching (configurable)
- Multi-currency normalization with historical ECB rates (EUR, USD, GBP, CHF)
- Broker-CSV parsing — DEGIRO first, extensible to other brokers
- Outputs _plusvalenze_ (gains) / _minusvalenze_ (losses)

The intended public API (the contract Olos integrates against — do not break it):

```ts
import { DEGIROParser, Calculator } from "minus-tracker";

const transactions = new DEGIROParser().parse(csv);
const report = new Calculator(transactions).calculateGains("LIFO"); // or "FIFO"
```

## Current state: pre-spec bootstrap

There is **no source code, `package.json`, or build/test tooling yet**. The repo currently holds
only vision/workflow docs. Do **not** invent build/lint/test commands or scaffold the engine ahead
of the spec — the design is produced spec-first via the workflow below.

When the toolchain lands, expect a standard TypeScript-library setup (TS compiler + a test runner
such as Vitest). Update this section with the real commands at that point.

## Spec-first workflow

This project is built spec-first using the slash commands in `.claude/commands/` (run in order):

1. `/spec_brainstorm` — from `docs/idea.md`, write the spec at `docs/PRD.md`
2. `/spec_review` — review and harden the PRD (analysis only; no implementation)
3. `/write_test_plan` — derive `docs/test_plan.md` from the PRD
4. `/write_impl_plan` — derive `docs/impl_plan.md` from the spec + test plan
5. `/do_impl_plan` — execute the impl plan (one Task per item, sub-agent per task, dependency waves)
6. `/run_test_plan` — verify against the test plan (one sub-agent at a time, ≤3 fix attempts/TC)

Note: `spec_brainstorm`/`spec_review` were copied from Olos and reference Olos-specific artifacts
(`CONTEXT.md`, evolving an existing app). Here the engine starts from `docs/idea.md` — treat those
Olos references as not-applicable unless the corresponding files exist.

## Conventions

- TypeScript, **minimal/zero runtime dependencies**, tree-shakeable, fully unit-tested.
- **Italian tax correctness is non-negotiable**: every calculation path must be covered by
  **Agenzia Entrate FAQ** test cases — these are the correctness baseline, not hand-written
  expectations.
- Italian domain terminology in outputs and docs: _plusvalenze_, _minusvalenze_, _Regime
  Dichiarativo_.
- Commit format: `feat|fix|docs|style|refactor|test|chore|perf`.
- minus-tracker is a **calculation aid, not tax advice** — keep that framing in user-facing text.

## Key docs

- `docs/idea.md` — vision, scope, roadmap, what's in/out of v0.5.0
- `README.md` — public-facing description and intended API
