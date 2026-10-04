---
title: PropAMM pricing
---

`previewBid` is indicative and does not move inventory. `buyCollateral` is callable only by the adapter during an authenticated job for that pool.

```
referenceValueDebt = collateralAmount * verified collateral/debt price
haircutBps = baseSpread + volatilityBuffer + sessionBuffer + inventorySkewAfterTrade
debtOut = floor(referenceValueDebt * (10000 - haircutBps) / 10000)
```

Rounding uses full-precision floor division. An invalid or stale price produces no bid. Inventory above the cap produces no bid. The pricing updater cannot withdraw.
