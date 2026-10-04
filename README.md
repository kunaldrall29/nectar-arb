# Nectar testnet prototype

Hackathon slice of [Nectar](https://github.com/): funded, time-bounded liquidation bids that settle debt and collateral atomically.

**Scope:** R1 rehearsal. One lending market, which this repository deploys itself. It is a Nectar rehearsal fixture, not Morpho Blue. The live demo session is local Anvil standing in for Arbitrum Sepolia (chain id 421614), which is not funded yet. Robinhood Chain testnet (chain id 46630) has a separate rehearsal deployment recorded in `deployments/robinhood-testnet.json`. The app does not treat that cash as spendable on the connected chain. Arbitrum Sepolia itself is not deployed.

**Not audited.** The EVM contracts are a new implementation. Earlier Stellar / Soroban liquidation work, including a Stellar grant, does not certify these contracts. Do not describe them as production-ready.

## What works

- Maker escrow: deposit, reserve on quote registration, release after expiry, withdraw only unreserved cash. Makers cannot touch each other's balances.
- EIP-712 single-fill quotes. Registration reserves the full `cashOut` or reverts. Quotes cannot be cancelled before the 120 second maximum lifetime. Execution at or after `validUntil` reverts.
- Rehearsal market: open a position, drop the mock price, liquidate by repaying debt and seizing a deterministic collateral amount.
- Executor: one transaction consumes the quote, repays the market from escrow, delivers collateral to the maker's recipient, and pays the signed keeper fee, protocol fee, and surplus. Any failed check reverts the whole transaction.
- Pause guardian: pauses new reservations and executions. Unreserved withdrawals still work.
- Testnet ERC-20s `nUSD` (6 decimals) and `nSTK` (18 decimals) with a public faucet mint. They are not USDC or a stock token.
- API reads chain state and indexes settlement logs. Amounts are decimal strings in base units.
- Web app: Overview, Markets, Liquidity, Executions, Analytics, Settings. Testnet is labeled on every screen. Empty, unavailable, and zero-capacity states are separate. Analytics shows only events from this deployment.

The settlement fixture used by tests and the demo quote is 10,000 debt units repaid, 50 keeper, 20 protocol fee, 70 surplus, summing to a cash out of 10,140. A cash out of 10,040 fails.

## Local demo

Requires Foundry and Node 22.

```bash
./scripts/dev-up.sh
```

That starts Anvil (chain id 31337), deploys the rehearsal if the escrow has no code, and runs the API on port 8787 and the web app on port 3000.

The web app's working signer is the **local rehearsal signer** (Foundry's public Anvil account 1). It is not a production key. The API refuses to use it unless the RPC chain id is 31337. Account 2 is the keeper. Both are unlocked development accounts.

Open http://127.0.0.1:3000. The environment pill says testnet and local Anvil. The Robinhood filter omits that chain's balances because this session is not connected to it. Connect wallet uses an injected browser wallet when one exists. WalletConnect is not configured.

A fresh deploy seeds one completed settlement (self-operated, visible in Analytics) and leaves a second borrower liquidatable for the live quote.

## Arbitrum Sepolia

Deployer address to fund (no private key in this file):

See `DEPLOYER_ADDRESS.txt`.

```bash
./scripts/deploy-sepolia.sh
```

The script reads `.secrets/deployer.key`, which is gitignored. A successful broadcast writes `deployments/arbitrum-sepolia.json`. Point the API at that manifest and the public RPC:

```bash
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc \
MANIFEST=deployments/arbitrum-sepolia.json \
npm start --prefix api
```

Automatic demo signing stays disabled on Sepolia. Use a wallet on chain id 421614. This prototype's one-click signer is Anvil-only.

If the deployer has no Sepolia ETH, the command above is the deploy path the moment it does. Public faucets checked for this prototype required a browser captcha or a mainnet balance, so no Sepolia deployment is claimed unless `deployments/arbitrum-sepolia.json` exists.

## Robinhood Chain testnet

`deployments/robinhood-testnet.json` records a rehearsal deployment on chain id 46630. RPC `https://rpc.testnet.chain.robinhood.com`. It is the same fixture, not production stock-collateral settlement, and it is not audited. The local demo API does not read that chain.

## Tests

```bash
cd contracts && forge test
```

## Sponsor and partner technologies

Only integrations that the code actually calls:

- **OpenZeppelin Contracts v5.6.1** — `ReentrancyGuard`, `Pausable`, `Ownable2Step`, `SafeERC20`, and `EIP712` in the Solidity sources. The Robinhood Chain testnet addresses were deployed before this change and were not redeployed, so that bytecode is the earlier build.
- **Paxos USDG** — official debt asset reads. Robinhood testnet `0x7E955252E15c84f5768B83c41a71F9eba181802F` and Arbitrum Sepolia `0xFFC95faa3d63Cde504a05B567C600B78C0b41892`. Both return symbol USDG and 6 decimals. Rehearsal debt remains nUSD.
- **GMX** — `GET /v1/reference/gmx` fetches `https://arbitrum-api.gmxinfra.io/prices/tickers` and the Markets screen shows `tokenAddress`, `tokenSymbol`, `minPrice`, `maxPrice`, `updatedAt`, and `timestamp` as Arbitrum One reference data, not the testnet fill.
- **ZeroDev** — Settings builds a Kernel account client with `@zerodev/sdk` and `@zerodev/ecdsa-validator` against project `61016d2a-e0df-4350-929c-d5f2110700d1` and bundler `https://rpc.zerodev.app/api/v3/61016d2a-e0df-4350-929c-d5f2110700d1/chain/421614`.

Fhenix CoFHE is not listed. `@cofhe/sdk` does not run a local encrypt/decrypt mock in this environment, and the app does not invent ciphertext. Dune is not listed. There is no `DUNE_API_KEY`. `analytics/queries/nectar_settlements.sql` is not executed.

Brand assets are the official mark, compact mark, lockup, and app icons from https://nectarnetwork.fun/media-kit. Canvas `#0d0f12`, accent `#16f3a9`, Syne and DM Mono.

## Honesty notes

- Combined nUSD figures in Overview are a rehearsal mark with a timestamp, not a market price and not a cross-chain balance.
- Analytics does not invent production volume.
- Keeper allowlisting is off and disclosed. The executor still enforces the quote.
- Reorg reconciliation beyond "chain head moved backwards, rebuild logs" is not implemented.
- No Aave adapter, no AMM route, no EIP-1271 wallets, no timelocked policy changes, no organization accounts.
