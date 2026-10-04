# Nectar

Liquidation liquidity and atomic settlement network.

This repository ships a **working Stellar / Soroban testnet prototype** of the Nectar product described in the Unified PRD: maker cash accounts, funded quotes, mock lending liquidation, and keeper execution with reconciled receipts. The same product vocabulary targets Arbitrum and Robinhood Chain for later EVM adapters.

## What's included

| Layer | Path | Status |
|---|---|---|
| Soroban contracts | `contracts/` | Deployed on Stellar **testnet** |
| Backend API | `backend/` | Express + Stellar SDK, talks to live contracts |
| Frontend | `frontend/` | Next.js workspace + landing |
| Deployment manifest | `deployments/testnet.json` | Contract IDs + fixture |

## Testnet contracts

See [`deployments/testnet.json`](deployments/testnet.json) for live IDs.

Network passphrase: `Test SDF Network ; September 2015`  
RPC: `https://soroban-testnet.stellar.org`

Deployer / agent public address:

`GATRVHTBT47FDWB6U4L3FQQXS5C7WSXIBKDVEC3DNA55GIF7BRUITILP`

Funded via Friendbot during setup.

## Contracts

```bash
cd contracts
stellar contract build
cargo test -p nectar_token -p quote_escrow
```

Core crates:

- `nectar_token` — debt / collateral tokens
- `mock_lending` — liquidatable positions
- `quote_escrow` — deposits, reservations, market admission
- `nectar_executor` — atomic settlement jobs

Deploy / seed:

```bash
./scripts/deploy_testnet.sh
./scripts/seed_demo.sh
```

## Backend

```bash
cd backend
cp .env.example .env   # set NECTAR_SECRET_KEY
npm install
npm run dev            # http://localhost:8787
```

Key routes: `/v1/networks`, `/v1/markets`, `/v1/accounts/:wallet/liquidity`, `/v1/quotes`, `/v1/jobs`, `/v1/receipts`, `/v1/overview`.

## Frontend

```bash
cd frontend
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:8787
npm install
npm run dev            # http://localhost:3000
```

App routes:

- `/` — brand landing
- `/app` — Overview / Markets / Liquidity / Executions + **Run live demo**

## Proven testnet flow

1. Mint nUSD / nAAPL  
2. Open unhealthy position in `mock_lending`  
3. Deposit maker cash into `quote_escrow`  
4. `register_quote` with PRD fixture economics (10,140 cash → 10,000 debt + 50 keeper + 20 fee + 70 surplus)  
5. `execute_job` via `nectar_executor`  
6. Receipt + explorer link

Example settlement tx:  
https://stellar.expert/explorer/testnet/tx/68bc043b07b5d09250ed63da11b5711cece8b1ce7a961d7128f2ff8ab7642fe5

## Environment variables

| Var | Where | Purpose |
|---|---|---|
| `NECTAR_SECRET_KEY` | backend | Deployer/operator secret (never commit) |
| `NECTAR_MANIFEST` | backend | Path to `deployments/testnet.json` |
| `STELLAR_RPC_URL` | backend | Soroban RPC |
| `NEXT_PUBLIC_API_URL` | frontend | Backend base URL |

## Scope honesty

**Working on testnet:** token mint, deposit/withdraw accounting, quote reserve/consume, liquidation settlement, API + UI against live contracts.

**Stubbed / deferred vs full PRD:** EIP-712 / EVM adapters, Arbitrum & Robinhood deployments, AMM routing, reorg indexer, org auth, production guardian multisig, Morpho Blue production adapters.


## Frontend deploy (Vercel)

Anonymous temporary deployment (claim to keep):

- Live URL: https://temporary-instant-drizzle-ybdvca7.vercel.app
- Claim: https://vercel.com/claim-deployment?code=bf24795a-41be-4536-a34a-bc5f84895844

For a durable deploy:

```bash
cd frontend
npx vercel login
NEXT_PUBLIC_API_URL=https://<your-backend-host> npx vercel --prod
```

Backend write ops require `NECTAR_SECRET_KEY` on the API host.
