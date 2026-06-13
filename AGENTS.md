# AGENTS.md

Guidance for AI agents (Claude Code et al.) working in this repository.

## Project Overview

**minus-tracker** is a standalone, open-source **TypeScript npm library + CLI** that automates
Italian capital-gains/loss calculation for the _Regime Dichiarativo_:

- LIFO/FIFO lot matching (configurable)
- Multi-currency normalization with historical ECB rates (EUR, USD, GBP, CHF)
- Broker-CSV parsing (DEGIRO first; extensible)
- Outputs _plusvalenze_/_minusvalenze_; Agenzia Entrate FAQ as the correctness baseline

It is **pure tax math** — no UI, no auth, no database, no PDF. It is the engine behind
[Olos](https://github.com/gabrielerandelli/Olos)'s Tax Hub but ships and works independently.

## Status & Workflow

Pre-spec bootstrap. This project is built **spec-first** using the commands in
`.claude/commands/` (copied from Olos):

1. `/spec_brainstorm` — from `docs/idea.md`, write the spec at `docs/PRD.md`
2. `/spec_review` — review and harden the PRD
3. `/write_test_plan` — derive `docs/test_plan.md` from the PRD
4. `/write_impl_plan` — derive `docs/impl_plan.md` from the spec + test plan
5. `/do_impl_plan` — execute the implementation plan
6. `/run_test_plan` — verify against the test plan

Do not implement engine code ahead of the spec/impl plan.

## Documentation

`docs/`: [idea.md](docs/idea.md) (vision). PRD, test plan, and impl plan are produced by the
workflow above.

## Conventions

- TypeScript, minimal/zero runtime dependencies, tree-shakeable, fully unit-tested.
- Italian tax correctness is non-negotiable: every calculation path is covered by Agenzia
  Entrate FAQ test cases.
- Commit format: `feat|fix|docs|style|refactor|test|chore|perf`.
- minus-tracker is a **calculation aid, not tax advice**.
