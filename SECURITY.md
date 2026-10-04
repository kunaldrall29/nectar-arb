# Security

Nectar's EVM contracts in this repository are not audited. Do not treat a deployment as production.

## Scope

The product is funded, time-bounded liquidity for liquidations. Makers bear inventory risk. Keepers pay their own failed gas. Guardian pause blocks new reservations and new executions. It has no function that seizes escrowed assets or changes the protocol fee recipient.

Quote accounting requires reserved cash to stay within liabilities, and token balances to cover liabilities. Direct donations do not credit a maker. Fee-on-transfer tokens are rejected.

The Morpho adapter accepts `onMorphoLiquidate` only from the pinned Morpho, during an open job, once. Nested, duplicate, unsolicited, and wrong-protocol callbacks revert.

There is no unrestricted `delegatecall`.

## Keys

The deployer key stays in `/workspace/.secrets/deployer.key` and is not committed. Local Anvil uses Foundry's published development keys and refuses them on any chain id other than 31337.

## Reporting

This repository does not run a paid bug bounty. Report issues to the repository maintainers with the chain id and transaction hash. Do not include private keys.
