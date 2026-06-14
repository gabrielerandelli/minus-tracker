# Part 8 — Correctness Baseline

## Principle

Every calculation path must be covered by **Agenzia Entrate FAQ** test cases.
Hand-written expectations are supplementary, not primary.

## Required test cases (from AE FAQ)

These scenarios must have dedicated test cases in the test suite:

| ID    | Scenario                                                                              |
| ----- | ------------------------------------------------------------------------------------- |
| AE-01 | LIFO: single BUY, single SELL, same currency (EUR) — gain                             |
| AE-02 | LIFO: single BUY, single SELL, same currency (EUR) — loss                             |
| AE-03 | LIFO: multiple BUYs (different dates/prices), single SELL — LIFO match order verified |
| AE-04 | FIFO: same as AE-03 but FIFO match order                                              |
| AE-05 | LIFO: partial lot consumption (SELL qty < most recent lot qty)                        |
| AE-06 | LIFO: SELL consumes multiple lots                                                     |
| AE-07 | Multi-currency: BUY in USD, SELL in USD, ECB conversion on each date                  |
| AE-08 | Multi-currency: BUY in EUR, SELL in USD                                               |
| AE-09 | Mixed ISIN: gains and losses across two ISINs, correct totals                         |
| AE-10 | Brokerage fees included in cost basis                                                 |
| AE-11 | SELL with no open lots → CalculationError                                             |
| AE-12 | ECB rate fallback: trade on weekend, uses Friday's rate                               |

## Acceptance criterion

All AE-01 through AE-12 must pass before v0.5.0 ships.
The test plan ([docs/test_plan.md](../test_plan.md)) derives concrete input/output fixtures
from these scenarios.

## Source material

- Agenzia Entrate — _Guida alla dichiarazione dei redditi: redditi diversi di natura finanziaria_
- Agenzia Entrate FAQ on capital gains in the Regime Dichiarativo
