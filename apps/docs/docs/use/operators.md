---
title: Lending operators
---

Operators admit a market in the [registry](../protocol/registry). The market id commits the chain, collateral, debt, adapter, oracle, Morpho parameters, and policy hash.

A guardian can pause execution or one market. Pause does not move funds and does not change the protocol fee recipient.

Borrowers are not migrated. Liquidation still has to satisfy the lending market's own health check.
