# Nectar contracts (Foundry)

HACKATHON / TESTNET SLICE. Core settlement contracts plus clearly labeled mocks.

| Contract | Role |
|---|---|
| `MakerEscrow` | Segregated maker cash per (maker, token). Deposit with balance-delta check, withdraw only unreserved cash. No admin withdrawal path. |
| `QuoteRegistry` | EIP-712 (`Nectar`/`1`) quote verification for EOAs and EIP-1271 wallets, maker nonces, 120s max lifetime, atomic cash reservation, permissionless idempotent release after expiry, single consumption by the executor. |
| `MarketRegistry` | Exact market identity + versioned policy behind a timelock (`schedulePolicy` / `activatePolicy`). Testnet deploys use delay 0; production policy is 48h. |
| `NectarExecutor` | `executeJob(quoteId, deadline)`: re-validates pause scopes, quote, policy hash, price freshness (PX01), sequencer uptime (PX03), position eligibility and `maxDebtRepay`, then liquidates through the Morpho-style callback and settles debt, collateral, keeper compensation, protocol fee and surplus atomically. `previewJob` returns the refusal code. |
| `PauseGuard` | Guardian can pause reservation/execution scopes (global or per market); only the recovery authority unpauses. Withdrawals of unreserved cash are never paused. |
| `mocks/*` | `MockLendingMarket` (Morpho-Blue-like liquidation ordering, LIF formula, bad-debt writeoff), `MockOracle` (price + timestamp + paused), `MockSequencerUptimeFeed`, `MockERC20` (test USDG/USDC, mTSLA, mNVDA). **All mocks.** |

```bash
forge build
forge test -vv            # 45 tests incl. fuzz + AC01 invariant
forge script script/Deploy.s.sol --rpc-url local --broadcast   # needs PRIVATE_KEY
```

The deploy script writes `../deployments/<chainId>.json` (addresses, codehashes, compiler settings, dependency versions, roles, deployment block, release commit). Use the repo root `make deploy-*` targets instead of calling it directly; they also fix up the deployment block from the broadcast receipts and discard the manifest if broadcast fails.
