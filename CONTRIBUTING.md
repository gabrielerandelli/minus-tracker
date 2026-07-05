# Contributing

Thanks for considering a contribution to minus-tracker.

## Setup

```bash
npm ci
npm run build
npm test
```

`npm test` runs the full vitest suite (~120 test cases). One integration test group
(`TC-041b`, live ECB API) requires network access and will fail in offline/sandboxed
environments — that's expected and unrelated to your change.

## Adding a broker parser

The CSV parser (`src/parser/`) currently supports DEGIRO's Transactions export. Support for other
brokers is welcome via PR: add a new parser module following the existing `DEGIROParser` shape
(same `parse()` contract, same `Transaction`/`IncomeRow` output types in `src/types.ts`), plus
test cases under `test/` covering the broker's actual export format.

## Tax-correctness changes

Any change touching gain/loss calculation, bucket classification, or the Modello Redditi PF
output must be covered by a test case, and — where applicable — cross-checked against the
relevant Agenzia delle Entrate FAQ. See `test/` for the existing TC-\* naming convention.

## Pull requests

- Keep PRs focused — one logical change per PR.
- Run `npm run build && npm test` before opening the PR.
- Follow the commit format used in this repo: `feat|fix|docs|style|refactor|test|chore|perf`.

## Reporting bugs / requesting features

Open an issue at https://github.com/gabrielerandelli/minus-tracker/issues. For security issues,
see [SECURITY.md](./SECURITY.md) instead.
