# Nectar

**Liquidation liquidity + atomic settlement** for lending operators, collateral buyers (makers) and keepers.

This repository is a **public-testnet vertical slice (R1 toward R2)**: one working chain (Arbitrum Sepolia, 421614) and a unified UI that also shows Robinhood Chain Testnet (46630). Funds never cross chains.

A maker deposits the market debt token, registers a funded EIP-712 quote, and a keeper consumes that reservation inside an eligible liquidation. Successful transactions record actual debt repayment, collateral delivery and fees.

## Honest inventory

| Item | Status |
|---|---|
| Contracts (Foundry 1.8.4 / solc 0.8.24) | Implemented and tested |
| Mock Morpho Blue + mock oracle + mock nmUSDC/nmSTK | **Rehearsal only — not production lending** |
| Arbitrum Sepolia deploy | Requires testnet ETH — see [FUNDING.md](FUNDING.md) |
| Robinhood Chain Testnet | RPC reachable via `https://46630.rpc.thirdweb.com`; **no Nectar deploy yet** (0 gas) |
| Local Anvil e2e | `./scripts/demo-local.sh` |
| Keeper agent | `apps/keeper` — no escrow withdraw authority |
| Web + `/v1` APIs | `apps/web` (Vercel-ready) |
| Nectar token / insurance / bridges / AI signing | **Not built** (V1 exclusions) |

## Fund these addresses (Arbitrum Sepolia ETH)

**Deployer** `0xB1A974969D7e81E71573cBdB3f6d318601d64014`  
**Keeper** `0x123a06CBd1125973b5E0Cecaf0D9B1EF574835D0`  

Details and explorer links: [FUNDING.md](FUNDING.md) · [DEPLOYMENT.md](DEPLOYMENT.md) · [PRODUCT.md](PRODUCT.md)

## How to run

```bash
npm install
export PATH="$HOME/.foundry/bin:$PATH"
cd contracts && forge test -vv && cd ..
./scripts/demo-local.sh
npm run dev                 # http://localhost:3000
```

### Keeper

```bash
export KEEPER_PRIVATE_KEY=$(tr -d '\n' < .secrets/keeper.key)
export CHAIN_ID=31337 RPC_URL=http://127.0.0.1:8545
npm run keeper
```

See [apps/keeper/README.md](apps/keeper/README.md).

### Testnet

After funding the deployer:

```bash
./scripts/deploy-sepolia.sh
```

## Vercel

```bash
npx vercel --yes --cwd apps/web
```

If `VERCEL_TOKEN` is present, a production deploy is attempted. The Next app hosts the read APIs and indexer so the public URL is not a dead UI.

## Layout

```
contracts/          Foundry (MarketRegistry, QuoteEscrow, NectarExecutor, RiskGuard, MorphoBlueAdapter, mocks)
apps/web            Next.js App Router + /api/v1
apps/keeper         Keeper agent
packages/sdk        ABIs + EIP-712 quote helpers
deployments/        Manifests (network, addresses, compiler, commit, block)
scripts/            Deploy, seed, local demo
```

## Tests

Foundry covers T01–T11, T14, T16, T17, T22, T23, T24 and a cash-conservation fuzz (256 runs). Numerical fixture: debt 10000 + keeper 50 + protocol 20 + surplus 70 = cashOut 10140. A 10040 cashOut fails.
