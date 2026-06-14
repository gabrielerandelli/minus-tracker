# Part 5 — Core Logic

## Lot matching overview

```
Transactions (sorted by date asc)
        │
        ▼
  ┌─────────────┐    BUY  ──►  open lots stack (per ISIN)
  │  Lot Matcher │
  └─────────────┘    SELL ──►  match against stack (LIFO or FIFO)
        │
        ▼
  MatchedLot[]  ──►  GainsReport
```

## Data structures

```
openLots: Map<ISIN, Lot[]>

Lot {
  date: string        // ISO
  quantity: number    // remaining (decremented as matched)
  pricePerUnitEUR: number
  feesEUR: number     // proportional fees allocated on match
  fxRate?: number
}
```

## LIFO algorithm

For each SELL (processed in chronological order):

1. Pop from the **end** of `openLots[isin]` (most recent lot).
2. If lot.quantity >= sell.quantity → partially consume lot, record `MatchedLot`, done.
3. If lot.quantity < sell.quantity → consume entire lot, record `MatchedLot`, subtract from
   remaining sell quantity, repeat from step 1.
4. If stack exhausted before sell is fully matched → throw `CalculationError`.

FIFO: same, but pop from the **start** of the array.

## Cost basis calculation

```
buyCostEUR      = (lot.pricePerUnitEUR * matchedQty) + allocatedBuyFeesEUR
sellProceedsEUR = (sell.pricePerUnitEUR * matchedQty) - allocatedSellFeesEUR
gainLossEUR     = sellProceedsEUR - buyCostEUR
```

Fee allocation (proportional to matched quantity):

```
allocatedFees = lot.feesEUR * (matchedQty / originalLotQty)
```

## Report aggregation

```
plusvalenze  = sum of gainLossEUR where gainLossEUR > 0
minusvalenze = sum of |gainLossEUR| where gainLossEUR < 0
netResult    = plusvalenze - minusvalenze
```

## Sorting guarantee

Transactions must be sorted ascending by date before lot matching begins.
`Calculator` sorts internally — callers do not need to pre-sort.

## Edge cases

| Case                    | Behaviour                                 |
| ----------------------- | ----------------------------------------- |
| SELL with no open lots  | `CalculationError`                        |
| Partial lot consumption | Lot stays in stack with reduced quantity  |
| Same-day BUY + SELL     | BUY processed first (stable sort by type) |
| Multiple ISINs          | Lots are isolated per ISIN                |
