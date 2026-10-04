---
title: Security model
---

The contracts are not audited. A pause stops new reservations and new executions. It does not seize escrowed cash and it does not change recipients.

Quote solvency: reserved cash is at most liabilities, and the token balance covers liabilities. Donations do not increase a maker's cash.

Callback authentication: `onMorphoLiquidate` must come from the pinned Morpho during an open job, once. Nested and duplicate calls revert.

Read [the threat model](https://github.com/kunaldrall29/nectar-arb/blob/cursor/nectar-evm-protocol-3d1a/docs/THREAT_MODEL.md) in the repository (`docs/THREAT_MODEL.md`). The in-repo summary is this page. Operational limits are in [deploy](../operations/deploy).
