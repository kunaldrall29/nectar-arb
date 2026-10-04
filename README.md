# Nectar — testnet prototype

Nectar is a **liquidation liquidity and settlement network**: makers deposit debt-token cash and sign **funded, time-bounded, single-fill quotes**; keepers execute eligible liquidations on a Morpho-Blue-style market, **atomically consuming** a maker quote; receipts record debt repaid, collateral delivered, and fees.

This repository is a **hackathon / public testnet slice** (mock lending, mock oracles). The EVM deployment is **new** and **not** certified by Nectar’s prior Stellar/Soroban audit.

## Architecture

```
┌─────────────────┐     read chain (viem)      ┌──────────────────────────────┐
│  Next.js web    │ ─────────────────────────► │  Arbitrum Sepolia / Anvil    │
│  (6 destinations)│     wallet txs            │  MiniMorpho · Registry ·     │
└────────┬────────┘                            │  MakerVault · NectarExecutor │
         │ optional                            └──────────────▲───────────────┘
         ▼                                                     │
┌─────────────────┐   indexer + REST (/v1)                     │ executeJob
│  backend/       │ ───────────────────────────────────────────┤
│  API · agent    │   keeper agent (pnpm agent)                │
└─────────────────┘                                            │
         ▲                                                     │
         └──────────── @nectar/core (reader, keeper, ABIs) ────┘
```

| Layer | Path | Role |
|--------|------|------|
| Contracts | `contracts/` | Foundry: lending, registry, EIP-712 quotes, atomic executor |
| Core SDK | `packages/core/` | ABIs, chain reader, keeper tick, analytics, refusal codes |
| Backend | `backend/` | Event indexer, REST API, runnable keeper agent |
| Frontend | `web/` | App Router UI: Overview, Markets, Liquidity, Executions, Analytics, Settings |
| Manifests | `deployments/<chainId>.json` | Per-network addresses (31337 local, 421614 testnet when deployed) |

## Prerequisites

- [Foundry](https://book.getfoundry.sh/) (`forge`, `anvil`, `cast`)
- Node 20+ and [pnpm](https://pnpm.io/) 9 (`corepack enable`)

## Local development

### 1. Contracts

```bash
cd contracts && forge test
```

### 2. Local chain + deploy

Start Anvil (example):

```bash
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s anvil -- anvil --host 0.0.0.0
pnpm deploy:local    # writes deployments/31337.json and regenerates ABIs
```

### 3. Backend (optional — frontend reads chain directly)

```bash
pnpm indexer          # canonical event cache → backend/data/events-*.json
pnpm api              # http://localhost:8787/v1/health
pnpm agent            # keeper on NECTAR_NETWORK=local (default)
pnpm backend          # API + agent together
```

Environment:

| Variable | Purpose |
|----------|---------|
| `NECTAR_NETWORK` | `local` · `arbitrum-sepolia` · `robinhood-testnet` |
| `RPC_URL` | Override RPC |
| `KEEPER_PRIVATE_KEY` | Keeper signer (defaults to Anvil key #0 on local) |
| `DRY_RUN=1` | Agent simulates only |

### 4. End-to-end smoke (Anvil)

```bash
pnpm e2e:local
```

Stresses mock oracles, registers a funded quote, runs one keeper pass, and asserts an included liquidation receipt.

### 5. Frontend

```bash
pnpm web              # http://localhost:3000 — select Local Anvil in Settings
pnpm build            # production build (web/)
```

Set `NEXT_PUBLIC_NECTAR_NETWORK=arbitrum-sepolia` on Vercel for public testnet.

## Testnet deploy (Arbitrum Sepolia)

1. Fund the deployer wallet (see `cast wallet address` from `.secrets/deployer.env` — **never commit the key**).
2. ~**0.05 ETH** on Arbitrum Sepolia is enough for deploy + demo seeding.

```bash
pnpm deploy:arbitrum-sepolia
# optional: ARBISCAN_API_KEY for verification
```

Writes `deployments/421614.json` and refreshes ABIs/manifests.

Robinhood Chain Testnet (chain **46630**): RPC is configured; deployment manifest pending — UI shows **Coming soon**.

## Vercel

Root directory for deploy: **`web/`**. Install/build from monorepo root (see `web/vercel.json`).

Add **`VERCEL_TOKEN`** in Cursor Dashboard → Cloud Agents → Secrets to enable `npx vercel --prod` from the agent environment.

## Security & disclosures

- Original Nectar (Stellar/Soroban) received ~**$75k** grant funding and underwent a **security audit**; that work does **not** cover these EVM contracts.
- Testnet uses **mock prices and mock lending** (labeled in the UI).
- Founder-stated **$148k+** historical testnet volume refers to prior deployments, not fabricated on-chain metrics in this demo.

## License

See repository defaults; contracts SPDX MIT.
