---
title: Robinhood asset policies
---

`RiskGuard` has two Robinhood fixtures.

The fresh-price stock fixture accepts a positive price whose timestamp is not in the future and is inside the staleness window, with the session open and no corporate action. The feed scale must equal the policy scale. The guard returns the oracle answer unchanged and does not apply a second multiplier.

The corporate-action and session fixture rejects a closed session and a corporate-action flag. A closed session does not make a stale price valid: staleness is checked first.

The live Robinhood Chain addresses in [Releases](../releases/addresses) are the earlier rehearsal, not these policy modules.
