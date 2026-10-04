# Nectar (testnet prototype)

Liquidation liquidity and settlement network — **hackathon / testnet slice** with mock lending market, oracle, and tokens on **Arbitrum Sepolia (421614)** and **Robinhood Chain Testnet (46630)**.

## Stack

| Layer | Tech |
|-------|------|
| Contracts | Foundry, MakerEscrow, QuoteRegistry (EIP-712), MarketRegistry, NectarExecutor, PauseGuard |
| Backend | Node/TS, Fastify, SQLite indexer, keeper bot, seed script |
| Web | Next.js 14, Tailwind, wagmi/viem, bundled snapshot + optional live API |

## Quick start (local anvil)

```bash
# Terminal 1 — Arbitrum-config anvil
npm run anvil:arb

# Terminal 2 — deploy + ABI export
npm run deploy:local-arb

# Terminal 3 — backend (indexer + keeper)
cd backend && npm install && npm run start

# Terminal 4 — seed demo (borrower, price shock, maker quote → keeper executes)
cd backend && npm run seed

# Web UI
cd web && npm install && npm run dev
# open http://localhost:3000
```

One-shot local rehearsal:

```bash
npm run demo:local
```

## Testnet deploy (when deployer is funded)

```bash
cp .env.example .env
# set DEPLOYER_PRIVATE_KEY (never commit)

npm run deploy:arb-sepolia
npm run deploy:robinhood-testnet
node scripts/export-abi.mjs
```

Manifests are written to `deployments/<chainId>.json`.

## Contracts

```bash
cd contracts && forge test
```

## Backend API

- `GET /api/overview` — workspace summary  
- `GET /api/markets` · `/api/quotes` · `/api/cash-accounts` · `/api/executions` · `/api/analytics`  
- `GET /health`

Env: see `.env.example` (`ENABLED_NETWORKS`, `KEEPER_ENABLED`, `RPC_URL_*`).

## Web (Vercel)

`web/` builds without a backend: Next.js API routes serve a **bundled snapshot** (`web/src/generated/snapshot.json`). Refresh after seeding:

```bash
BACKEND_URL=http://127.0.0.1:8787 npm run snapshot
```

Deploy to Vercel (requires secret):

```bash
cd web
npx vercel --prod --token $VERCEL_TOKEN --yes
```

Add `VERCEL_TOKEN` in **Cursor Dashboard → Cloud Agents → Secrets**.

Optional live mode: set `NEXT_PUBLIC_NECTAR_API_URL` to your backend URL.

## Scope & safety

- Mock tokens and lending — not production Morpho/Aave deployments.  
- Persistent **TESTNET** labeling in the UI.  
- Keeper jobs stored in SQLite to avoid duplicate submissions after restart.
