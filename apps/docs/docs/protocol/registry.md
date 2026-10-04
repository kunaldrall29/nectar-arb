---
title: Market registry
---

`MarketRegistry` is the exact identity of a Nectar market. Registration computes the id from the chain, tokens, adapter, oracle, Morpho market parameters, policy version, and policy hash.

Collateral and debt are admitted at registration. The guardian's pause functions are the only mutators after that, and they do not transfer tokens.

The executor refuses a job whose adapter or Morpho address does not match the registry.
