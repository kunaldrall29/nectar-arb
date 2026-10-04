---
title: Executor
---

`NectarExecutor` runs one job. It checks pause, market identity, and deadline, then asks the adapter to liquidate.

The synthetic allocation used in tests is debt repay 10000, maker cash 10140, keeper 50, protocol fee 20, surplus 70. Those transfers sum to 10140. A quote of 10040 fails that allocation. An external route that returns 9820 when 10000 is required is rejected. If an external route returns more debt than both the quote and the PropAMM, it is selected.

The protocol fee recipient is immutable. Guardian pause cannot change it.
