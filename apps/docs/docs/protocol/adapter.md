---
title: Morpho adapter
---

`MorphoBlueAdapter` calls the pinned `liquidate` function. Upstream Morpho Blue transfers collateral to the liquidator, then calls `onMorphoLiquidate` when data is present, then pulls the loan token. That order is what allows a collateral sale inside the callback without a flash loan.

The lab deployment is **Nectar Sandbox Morpho**. `officialMorphoDeployment()` returns false. It is not Morpho's official testnet deployment. Share accounting in the sandbox is 1:1 so a lab can demand an exact repay. The callback order and the function signature follow upstream Morpho Blue.

Unsolicited, nested, duplicate, and wrong-protocol callbacks revert before they can spend assets.
