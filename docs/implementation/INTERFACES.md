# Locked interfaces

The Foundry root for these modules is `packages/contracts`. The rehearsal contracts under `contracts/src` stay compiled by the original Foundry project.

EIP-712 domain for a firm quote: name `NectarQuoteEscrow`, version `1`, verifying contract = `QuoteEscrow`. Default lifetime 30 seconds. Maximum 120 seconds. No cancel before `validUntil`. A fill at `timestamp >= validUntil` reverts.

Quote typehash matches the field list in `packages/contracts/src/libraries/QuoteTypes.sol`.

| Module | Entry points that tests and the SDK bind to |
| --- | --- |
| `MarketRegistry` | `computeMarketId`, `register`, `admit`, `setExecutionPaused`, `setMarketPaused`, `getMarket` |
| `QuoteEscrow` | `deposit`, `withdraw`, `registerQuote`, `release`, `consume`, `hashTypedData` |
| `NectarExecutor` | `execute`, `selectRoute`, `activeJob` |
| `MorphoBlueAdapter` | `liquidate`, `onMorphoLiquidate` |
| `NectarSandboxMorpho` | `liquidate(MarketParams,borrower,seizedAssets,repaidShares,data)` then collateral transfer, then `onMorphoLiquidate(uint256,bytes)`, then loan pull. `officialMorphoDeployment()` is false |
| `NectarPropAMM` | `previewBid`, `buyCollateral`, maker `withdrawDebt` / `withdrawCollateral` |
| `RiskGuard` | `verify`, `tryVerify` |
| `ExternalSwapAdapter` | `sell` reverts when output is below `minOut` |
| `RouteLib` | `allocationWorks`, `select` |

Guardian pause has no token-transfer and no recipient setter. Pricing updater has no withdraw. `buyCollateral` and `sell` run only inside an authenticated executor job.
