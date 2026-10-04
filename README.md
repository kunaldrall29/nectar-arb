# Nectar (nectar-arb)

Hackathon **R1 vertical slice**: funded liquidation quotes, escrow reservations, atomic settlement, unified Next.js workspace, and indexer API on **chain ID 421614** (Arbitrum Sepolia semantics).

## Scope labels

| Area | Status |
|------|--------|
| MarketRegistry, QuoteEscrow, NectarExecutor, RiskGuard | Implemented |
| Morpho Blue on public testnet | **Deferred** — `MockLendingMarket` + `MorphoAdapter` (PX05) |
| Robinhood Chain Testnet (46630) | Not deployed (single-chain slice) |
| Public Arbitrum Sepolia broadcast | **Pending funding** (see Deployer wallet) |
| Local rehearsal | `anvil --chain-id 421614` + `npm run e2e:testnet` |

## Deployer wallet (fund for public testnet)

**Address:** `0x88588da9a43B58A6D2C441E3021788f6a6c6Dba5`  
**Private key:** `0x0e9bdd07bae900c5791ca25f65057dbb0ce0c1607c11727cf5f4546b7ce9fa8f`  

Send **≥ 0.001 ETH** on Arbitrum Sepolia, then:

```bash
export DEPLOYER_PRIVATE_KEY=0x0e9bdd07bae900c5791ca25f65057dbb0ce0c1607c11727cf5f4546b7ce9fa8f
export ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
bash scripts/deploy-testnet.sh
node scripts/write-manifest.mjs packages/contracts/broadcast/Deploy.s.sol/421614/run-latest.json
npm run e2e:testnet
```

**Never reuse this key in production.**

## Deployed contracts (local rehearsal manifest)

See [`deployments/arbitrum-sepolia.json`](deployments/arbitrum-sepolia.json). After public deploy, addresses will update.

## Run locally

```bash
# Terminal 1 — local chain (or use public RPC + funded key)
anvil --chain-id 421614 -p 8545

# Deploy + E2E (deposit → quote → execute)
npm install
npm run e2e:testnet

# API indexer
npm run dev:api

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8787 npm run dev:web
```

## Tests

```bash
npm run test:contracts
```

## Architecture

- `packages/contracts` — Foundry (EIP-712 quotes, conservation tests)
- `apps/api` — Fastify `/v1/*` + SQLite indexer
- `apps/web` — Next.js (Overview, Markets, Liquidity, Executions, Settings) + wagmi/RainbowKit

## Demo

- Narration script: [`docs/demo-script.md`](docs/demo-script.md)
- Screen recording: `docs/artifacts/nectar-demo.mp4` (after recording step)

## Vercel

```bash
cd apps/web && npx vercel --prod
```

Set `NEXT_PUBLIC_API_URL` to your API host. WalletConnect: set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
