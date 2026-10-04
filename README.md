# Nectar

Unified liquidation liquidity for lending operators, collateral buyers, and keepers.

This repository is an **R1 / buildathon testnet prototype** of the Nectar PRD (Arbitrum + Robinhood Chain product). It implements the funded-quote happy path end-to-end: escrow → EIP-712 quote reservation → atomic Morpho-style liquidation → receipts.

> Heritage: the product narrative inherits the Stellar/Soroban pooled-liquidation work (including a prior ~$75k Stellar grant). This codebase is the **EVM** implementation specified in the unified PRD (Solidity / Foundry), not a Soroban port.

## Architecture

```
frontend (Next.js)  →  backend (Express + viem)  →  QuoteEscrow / NectarExecutor / MarketRegistry / RiskGuard / MorphoAdapter
                                                      ↓
                                               MockLendingMarket + MockERC20 (testnet fixtures)
```

| Package | Role |
|---|---|
| `contracts/` | Foundry contracts + e2e fixtures (Section 9 numerical test) |
| `backend/` | Versioned `/v1` API, indexer-lite store, keeper demo relays |
| `frontend/` | Brand-first app: Overview, Markets, Liquidity, Executions, Analytics, Settings |
| `scripts/deploy.sh` | Deploy agent (local anvil or Arbitrum Sepolia) |
| `agent/DEPLOY_AGENT.md` | Operator runbook |

## Fund the deploy wallet

**Public address (fund on Arbitrum Sepolia):**

```
0xa6CdB06Dc088Fa28cE1b170309f34e8dB739AF74
```

Secret (gitignored): `.secrets/DEPLOYER_PRIVATE_KEY.txt`

Faucets:
- https://faucet.quicknode.com/arbitrum/sepolia
- https://www.alchemy.com/faucets/arbitrum-sepolia

```bash
cast balance 0xa6CdB06Dc088Fa28cE1b170309f34e8dB739AF74 \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

## Quick start (local)

```bash
# 1) Contracts → local anvil (auto-starts, funds deployer)
./scripts/deploy.sh local

# 2) Backend
cd backend && npm install && RPC_URL=http://127.0.0.1:8545 npm run dev

# 3) Frontend
cd frontend && npm install && npm run dev
# open http://localhost:3000
```

Happy path:

```bash
curl -X POST http://localhost:4000/v1/demo/run-liquidation | jq
```

## Deploy Arbitrum Sepolia

```bash
./scripts/deploy.sh arbitrum-sepolia
# writes deployments/latest.json
```

Then restart backend with:

```bash
export PRIVATE_KEY=$(cat .secrets/DEPLOYER_PRIVATE_KEY.txt)
export RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
export CHAIN_ID=421614
cd backend && npm start
```

## Env vars

See `.env.example`. Important:

| Var | Purpose |
|---|---|
| `PRIVATE_KEY` | Deployer/keeper key (never commit) |
| `ARB_SEPOLIA_RPC_URL` / `RPC_URL` | JSON-RPC |
| `DEPLOYMENT_PATH` | Defaults to `deployments/latest.json` |
| `NEXT_PUBLIC_API_URL` | Optional absolute API; default uses `/api` proxy |
| `API_UPSTREAM_URL` | Next.js server-side proxy target |

## Vercel

```bash
cd frontend
npx vercel --prod
# Set API_UPSTREAM_URL to your public backend if available.
# Without upstream, UI serves analytics/markets demo fallbacks and shows fund-wallet instructions.
```

## Contract tests

```bash
cd contracts && forge test --via-ir -vv
```

## Scope label

Implemented: **R1 one-chain vertical slice** on Arbitrum Sepolia chain-id semantics (local anvil + deployable Sepolia). Robinhood Chain is monitored in-app, not yet settled. Mock lending adapter stands in for Morpho Blue until live market admission.
