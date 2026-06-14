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
sellPricePerUnitEUR = sell.totalEUR / sell.quantity   // derived; not a stored field

buyCostEUR      = (lot.pricePerUnitEUR * matchedQty) + allocatedBuyFeesEUR
sellProceedsEUR = (sellPricePerUnitEUR * matchedQty) - allocatedSellFeesEUR
gainLossEUR     = sellProceedsEUR - buyCostEUR
```

Fee allocation (proportional to matched quantity):

```
// BUY fee: allocated from the BUY lot, relative to original lot size
allocatedBuyFeesEUR  = lot.feesEUR  * (matchedQty / originalBuyLotQty)

// SELL fee: allocated from the SELL transaction, relative to total sell quantity
allocatedSellFeesEUR = sell.feesEUR * (matchedQty / sell.quantity)
```

When a single SELL matches multiple BUY lots, SELL fees are split proportionally across each
matched lot using the same formula, where `sell.quantity` is the total original sell quantity.

## Report aggregation

```
plusvalenze  = sum of gainLossEUR where gainLossEUR > 0
minusvalenze = sum of |gainLossEUR| where gainLossEUR < 0
netResult    = plusvalenze - minusvalenze
```

## Rounding rules

All intermediate values (`buyCostEUR`, `sellProceedsEUR`, `gainLossEUR`, allocated fees) are
carried at full floating-point precision. Rounding to **2 decimal places** (half-up) is applied
only when writing final output fields in `GainsReport` and in CLI rendering:

- `MatchedLot.buyCostEUR`, `MatchedLot.sellProceedsEUR`, `MatchedLot.gainLossEUR`
- `GainsReport.plusvalenze`, `GainsReport.minusvalenze`, `GainsReport.netResult`

"Half-up" means: 0.005 rounds to 0.01 (towards positive infinity for positive values).

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
