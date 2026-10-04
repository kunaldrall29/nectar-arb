# Nectar (nectar-arb)

**Stage:** R1 one-chain vertical slice + unified app shell (R2 partial). EVM implementation on Arbitrum Sepolia chain-id rehearsal; Robinhood Chain testnet stubbed in manifest.

Nectar is liquidation liquidity and settlement: makers fund cash accounts, publish time-bounded quotes, and keepers execute atomic liquidations through `NectarExecutor` + protocol adapters. This repository implements the PRD core contracts (`QuoteEscrow`, `MarketRegistry`, `NectarExecutor`) with a **demo Morpho adapter** for testnet rehearsal (not production Morpho bytecode).

## Stack

| Layer | Tech |
|---|---|
| Contracts | Solidity 0.8.24, Foundry, OpenZeppelin |
| API | Hono + viem (`apps/api`) |
| Web | Next.js 14 + wagmi (`apps/web`) |

## Quick start (local E2E)

```bash
# Terminal 1 — local Arbitrum Sepolia rehearsal (chain 421614)
export PATH="$HOME/.foundry/bin:$PATH"
anvil --chain-id 421614 --port 8545

# Terminal 2 — deploy
cd packages/contracts
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast --skip-simulation

# Terminal 3 — app
npm install
npm run dev -w @nectar/api
npm run dev -w @nectar/web
```

Open http://localhost:3000 (connect MetaMask to `http://127.0.0.1:8545`, chain 421614).

### Keeper demo (fixture T24 — 10,140 units)

```bash
npm run demo:keeper -w @nectar/api
```

## Public Arbitrum Sepolia deploy

Fund the deployer (see `deployments/manifest.json` → `publicTestnetFundingAddress`) with Sepolia ETH, then:

```bash
export DEPLOYER_PRIVATE_KEY=...
export ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
./packages/contracts/scripts/deploy-arbitrum-sepolia.sh
```

Update `deployments/manifest.json` with broadcast addresses.

## API (PRD §14 subset)

Base URL: `http://localhost:8787`

- `GET /v1/networks`
- `GET /v1/markets`
- `GET /v1/accounts/:wallet/liquidity`
- `POST /v1/quotes` (idempotency-key)
- `POST /v1/jobs/preview`
- `POST /v1/jobs`

## Contracts

```bash
cd packages/contracts && forge test
```

## Scope label

- **In scope:** escrow ledger, EIP-712 quote registration, executor settlement, numerical fixture, unified UI destinations, testnet manifest.
- **Out of scope / mocked:** production Morpho Blue adapter, Robinhood oracle session rules, Postgres indexer, partner auth, mainnet.

## License

MIT (contracts and app code).
