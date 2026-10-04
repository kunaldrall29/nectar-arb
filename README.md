# Nectar

Funded liquidity for onchain liquidations. One product, two chains. Choosing a chain changes the environment. It does not create a balance that can be spent on the other chain.

Customers are lending operators and vault curators. Makers buy collateral and bear inventory risk. Keepers earn the compensation declared in the job and pay their own failed gas. Borrowers stay under the lending protocol's rules.

There is no native token, no new lending protocol, and no public pooled-yield vault.

This repository is the EVM tree (`kunaldrall29/nectar-arb`). Stellar contracts are not in this tree. A $75,000 Stellar Community Fund grant is project history only. It is not an EVM audit, an EVM revenue figure, or evidence of product-market fit.

**Not audited.**

## Status

| Surface | State | Evidence |
| --- | --- | --- |
| Protocol modules | Implemented and tested | `packages/contracts`. `forge test --root packages/contracts` covers unit, fuzz, and invariant tests, including repay 10000 / cash 10140 / keeper 50 / protocol 20 / surplus 70. |
| Rehearsal contracts | Kept | `contracts/` still builds and its existing Foundry tests still pass. |
| Local Anvil (31337) | Working | `pnpm local:bootstrap` writes `deployments/protocol-local.json`. Funded-quote tx `0x8cc2ad61c2902b37a15b06f04567c0fce3b2eb99eaca74b08d8c036e036a3196` (debt 10000, surplus 70). PropAMM tx `0xf54d844bd1b1c715928ee5fc98f3c940e099f5521453a18e8076791254eaa742` (debt 10000, surplus 514). |
| Robinhood Chain testnet (46630) | Rehearsal only | `deployments/robinhood-testnet.json`. Escrow `0xa91112a940eaC477e114c6Ed90d35F108693999a`. Liquidation `0x6d69978efa2ffffee2a4e442000ea6a85e1456e1eb9c2d54b452f8ad305333f1`. That bytecode is the earlier rehearsal, not the modules in `packages/contracts`. |
| Arbitrum Sepolia (421614) | Blocked | Deployer `0x031e038aeba717714dacC95F16d03234d722bCBb` had 0 wei on `https://sepolia-rollup.arbitrum.io/rpc`. `pnpm deploy:contracts --network arbitrum-sepolia` prints `STILL ZERO` and does not write addresses. |
| API | Local SQLite | `/health`, `/v1/markets`, `/v1/quotes`, `/v1/receipts`. Amounts are integer strings. Docker is not available, so Postgres is not running. |
| Web | Local | `pnpm dev` serves the app on port 3000 against the local API. `https://nectar-network.vercel.app` already exists and still rewrites to a local API. No new public API URL is claimed. |
| Docs | Builds | `pnpm docs:build` (Docusaurus 3). |

The lab lending venue is **Nectar Sandbox Morpho**. It pins the upstream Morpho Blue liquidation callback order and is not an official Morpho deployment.

Official Paxos USDG, for reads, 6 decimals:

- Robinhood testnet `0x7E955252E15c84f5768B83c41a71F9eba181802F`
- Arbitrum Sepolia `0xFFC95faa3d63Cde504a05B567C600B78C0b41892`

The lab debt token is nUSD. It is not USDG.

## Local commands

Requires Foundry, Node 22, and pnpm.

```bash
pnpm install --frozen-lockfile
pnpm contracts:build
pnpm contracts:test
pnpm local:bootstrap
pnpm scenario:run --network local --scenario funded-quote
pnpm scenario:run --network local --scenario propamm
pnpm dev
```

Also:

```bash
pnpm env:check
pnpm docs:build
pnpm verify
pnpm deploy:contracts --network arbitrum-sepolia
pnpm deploy:contracts --network robinhood-testnet
```

`pnpm dev` prints `http://127.0.0.1:3000` and `http://127.0.0.1:8787/health`. The one-click signer works only when the RPC chain id is 31337. Before a signature, the quote screen shows network, asset, amount, destination, expiry, and fee.

## Layout

- `packages/contracts` — MarketRegistry, QuoteEscrow, NectarExecutor, MorphoBlueAdapter, Nectar Sandbox Morpho, PropAMM, RiskGuard, external swap adapter
- `contracts` — earlier rehearsal Foundry project, still tested
- `packages/sdk` — EIP-712 types, ABIs, keeper submit notes
- `packages/worker` — in-flight transaction recovery
- `api` — Hono API
- `web` — Next.js app
- `apps/docs` — Docusaurus

OpenZeppelin Contracts v5.6.1 is vendored at `contracts/lib/openzeppelin-contracts`.
