---
title: Keepers
---

A keeper submits one bounded job to the executor. The route is a funded quote, a PropAMM bid, or an approved external swap. If the transaction reverts, the keeper paid the gas.

The worker stores the transaction hash before it waits for a receipt. A restart waits for that hash instead of sending a second transaction. See the [SDK](../build/sdk).
