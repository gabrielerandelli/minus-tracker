# minus-tracker — PRD Index

**Version:** 0.5.0 | **Status:** Draft (June 2026)

minus-tracker is a TypeScript npm library + CLI for Italian capital-gains calculation
(_Regime Dichiarativo_). Pure tax math — no UI, no auth, no database.

---

## Parts

| #   | File                                       | Contents                                 |
| --- | ------------------------------------------ | ---------------------------------------- |
| 1   | [Overview](prd/01-overview.md)             | Scope, non-goals, success metrics        |
| 2   | [Public API](prd/02-public-api.md)         | TypeScript types, public contract        |
| 3   | [DEGIRO Parser](prd/03-degiro-parser.md)   | CSV format, column spec, parsing rules   |
| 4   | [ECB Rates](prd/04-ecb-rates.md)           | Currency normalisation, bundled snapshot |
| 5   | [Core Logic](prd/05-core-logic.md)         | LIFO/FIFO lot matching algorithm         |
| 6   | [CLI](prd/06-cli.md)                       | Commands, flags, output format           |
| 7   | [Error Handling](prd/07-error-handling.md) | Hard errors vs. soft warnings            |
| 8   | [Correctness](prd/08-correctness.md)       | Agenzia Entrate FAQ test baseline        |
