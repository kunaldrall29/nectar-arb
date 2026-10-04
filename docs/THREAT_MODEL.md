# Threat model

This document describes the EVM protocol in `packages/contracts`. It is not an audit. The rehearsal contracts under `contracts/src` are a separate, earlier bytecode, including the Robinhood Chain testnet deployment.

## Assets

- Maker cash in `QuoteEscrow`
- Maker debt and collateral inventory in a PropAMM
- Collateral seized from a lending market during a job
- The protocol fee paid to the immutable recipient

## Actors

- Makers sign quotes or own a pool. They can withdraw only their unreserved cash or, for a pool, only the maker can withdraw.
- Keepers submit jobs. They cannot change quote recipients.
- A guardian pauses execution or one market.
- The lending market (Nectar Sandbox Morpho in the lab, or a future pinned Morpho) calls the liquidation callback.
- External routers are called only by the approved swap adapter, for the collateral amount of the job, and only if output meets `minOut`.

## In scope

- Forged quotes, including ERC-1271 wallets
- Replaying a nonce or a reservation id
- Filling at or after `validUntil`
- Withdrawing reserved cash
- Crediting donations or fee-on-transfer receipts
- Callbacks that are unsolicited, nested, duplicated, or from the wrong protocol
- Stale, future, nonpositive, closed-session, and corporate-action prices
- A second application of an oracle scale
- Route output below the required debt (the 9820 versus 10000 case)
- Guardian pause being used to seize funds or retarget fees

## Out of scope

- Key compromise of a maker, keeper, or deployer
- A malicious token that confiscates balances outside the standard ERC-20 return value, beyond the fee-on-transfer check
- Official Morpho governance or an official Morpho deployment. The sandbox is not that deployment
- Cross-chain message security. Chain balances are independent
- Oracle manipulation of an upstream feed beyond the freshness and scale checks

## Residual risk

Sandbox share accounting is 1:1. Connecting an official Morpho market requires re-checking share-to-asset conversion before the job's `repayAssets` bound is trusted. Sequencer grace is enforced only when a sequencer feed is configured.
