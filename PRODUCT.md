# Nectar — product scope (R1 toward R2)

Nectar is a **liquidation liquidity and atomic settlement network**.
Makers fund time-bounded bids. Keepers consume those bids inside an eligible liquidation.
A successful transaction records actual debt repayment, collateral delivery, and fees.

This repository is a **public-testnet vertical slice (R1 toward R2)**:

| Environment | Chain ID | Status in this slice |
|---|---:|---|
| Arbitrum Sepolia | 421614 | Live demo deployment target |
| Robinhood Chain Testnet | 46630 | Same UI; deploy if RPC is reachable, otherwise **monitored / unavailable** |
| Local Anvil | 31337 | Full rehearsal when testnet gas is missing |

Funds, permissions, and settlement stay on a single chain. The unified workspace never implies a cross-chain spendable balance.

## Who it is for

- Lending operators / vault curators who need reliable execution
- Collateral buyers (makers) who bid with reserved cash
- Liquidation keepers who submit bounded jobs

## Distinguishing capability

A **funded, time-bounded bid** reserved onchain and consumed inside an eligible liquidation.
Unsigned interest is not capacity. A signature is not capacity. Only an included reservation is executable.

## P0 journeys in this slice

1. Connect a wallet (or a demo injected/local signer that still signs real transactions)
2. Maker deposits the market debt token into `QuoteEscrow`
3. Maker registers a funded single-fill quote (EIP-712); cash is reserved
4. Keeper detects an unhealthy position, previews, and `executeJob`s atomically
5. Receipt shows debt repaid, collateral delivered, fees, tx hash, finality label
6. Expired quotes can be released; unreserved cash can be withdrawn
7. Overview / Markets / Liquidity / Executions / Analytics / Settings function
8. Wrong-network, reserved-funds, expired-quote, and RPC-unavailable states are honest

## Honest mock inventory

Live Morpho Blue markets on Arbitrum Sepolia are not assumed. This slice deploys a **labeled MOCK Morpho Blue**, mock oracle, and mock debt/collateral tokens for rehearsal. The UI must never present them as production lending deployments.

## V1 exclusions (not built)

Nectar token, insurance, cross-chain atomic settlement, bridges, leveraged makers, arbitrary AI signing.

## Adapter

Start with a Morpho Blue-style adapter: collateral in, sell against reserved maker cash, approve exact repayment, Morpho collects. Authenticated callback stage machine. No nested jobs.

Default quote lifetime 30 seconds, maximum 120 seconds (UI may use ~60s for demo).
