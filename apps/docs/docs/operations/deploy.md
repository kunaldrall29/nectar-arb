---
title: Deploy
---

```bash
pnpm deploy:contracts --network arbitrum-sepolia
pnpm deploy:contracts --network robinhood-testnet
```

Only chain ids 31337, 421614, and 46630 are allowlisted. A zero Sepolia balance stops the broadcast. Robinhood is left on the existing rehearsal unless a later change explicitly replaces it and checks `eth_getCode`.

Explorer verification is not claimed unless a verification command was actually run.
