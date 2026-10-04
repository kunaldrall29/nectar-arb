# Deployment

## Addresses to fund (public)

| Role | Address | Authority |
|---|---|---|
| Deployer | `0xB1A974969D7e81E71573cBdB3f6d318601d64014` | Deploy + admit markets + guardian/recovery in this slice |
| Keeper | `0x123a06CBd1125973b5E0Cecaf0D9B1EF574835D0` | `executeJob` only. No escrow withdraw. |
| Maker | `0x628298b2fb130fa9F4D714177858D9a0505c4E9d` | Deposit / quote / withdraw own cash |

Keys: `.secrets/deployer.key`, `.secrets/keeper.key`, `.secrets/maker.key` (gitignored).

See **FUNDING.md**.

## Local Anvil (always works)

```bash
export PATH="$HOME/.foundry/bin:$PATH"
./scripts/demo-local.sh
cp deployments/anvil.json deployments/active.json
cd apps/web && npm run dev
# keeper (optional second process)
export KEEPER_PRIVATE_KEY=$(tr -d '\n' < .secrets/keeper.key)
export CHAIN_ID=31337 RPC_URL=http://127.0.0.1:8545
npm run keeper
```

Point the frontend at Anvil by connecting the rehearsal wallet (Settings → paste maker key) and using chain 31337.

## Arbitrum Sepolia (421614)

RPC: `https://sepolia-rollup.arbitrum.io/rpc`  
Explorer: https://sepolia.arbiscan.io

```bash
./scripts/deploy-sepolia.sh
```

Writes `deployments/arbitrum-sepolia.json` (addresses, compiler, commit, block, bytecode hashes).

If the deployer balance is 0, the script exits and tells you to fund. The UI then shows `awaiting_gas` rather than fake markets.

## Robinhood Chain Testnet (46630)

RPC used: `https://46630.rpc.thirdweb.com` (returns `eth_chainId` `0xb626`).  
No Nectar deployment until the deployer holds native gas on that chain. The app shows **monitored**.

## Backend

Read APIs and a lightweight indexer live in Next.js route handlers (`apps/web/app/api/v1/...`) so the Vercel app is not a dead UI.

```
GET  /v1/networks
GET  /v1/markets
GET  /v1/markets/{marketKey}
GET  /v1/accounts/{wallet}/liquidity
POST /v1/quoteRequests
POST /v1/quotes
GET  /v1/quotes/{quoteId}
POST /v1/jobs/preview
POST /v1/jobs
GET  /v1/jobs/{jobId}
GET  /v1/receipts          ?format=csv
POST /v1/alerts
POST /v1/auth/challenge
POST /v1/auth/verify
```

Amounts are decimal strings in base units. Market/receipt responses include `chainId`, `sourceBlock`, `freshness`. Writes need `Idempotency-Key`.

## Frontend → deployment

The app reads `deployments/*.json` from the repo root (file-traced on Vercel). No user RPC config is required for routine reads.

## Compiler pin

Solidity `0.8.24`, optimizer 200 runs, `via_ir = true`, Foundry `1.8.4`, `forge-std` v1.17.0, Next `15.1.6`, viem `2.23.2`, wagmi `2.14.11`.
