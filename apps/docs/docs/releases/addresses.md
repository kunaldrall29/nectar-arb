---
title: Addresses
---

Generated from deployment manifests. Sepolia addresses are omitted unless `deployments/arbitrum-sepolia.json` exists.

## Arbitrum Sepolia (421614)

Not deployed. The deployer balance check is recorded as still zero when that is the result. No addresses are listed.

## Robinhood Chain testnet rehearsal (46630)

This table is the earlier rehearsal bytecode. It is not the protocol module set in `packages/contracts`.

| Contract | Address |
| --- | --- |
| Escrow | `0xa91112a940eaC477e114c6Ed90d35F108693999a` |
| Quotes | `0xB5B19c8C80F11d5912d0ff16C5eE673bd0DFA332` |
| Executor | `0x6F05CaD318337AFB72A94092Cd88f8485a48D6EC` |
| Market | `0xC1B0798cA4de3192b9db36cAbee8C891336D6b48` |
| Pause guardian | `0xd72E7bDf4603FB5Cd0355fB541A5c239ba11FEaD` |
| nUSD | `0xc436488f247f89d56d971ba60284a0929B177aA5` |
| nSTK | `0x2F4C92450a1A7B6485F2e144cc0A82A413E601A1` |

Liquidation transaction `0x6d69978efa2ffffee2a4e442000ea6a85e1456e1eb9c2d54b452f8ad305333f1`.

Official Paxos USDG on this chain, for reads: `0x7E955252E15c84f5768B83c41a71F9eba181802F`.

## Local protocol manifest

Local Anvil only. Nectar Sandbox Morpho is not an official Morpho deployment.

| Module | Address |
| --- | --- |
| marketRegistry | `0xB0D4afd8879eD9F52b28595d31B441D079B2Ca07` |
| quoteEscrow | `0x162A433068F51e18b7d13932F27e66a3f99E6890` |
| executor | `0x1fA02b2d6A771842690194Cf62D91bdd92BfE28d` |
| adapter | `0xdbC43Ba45381e02825b14322cDdd15eC4B3164E6` |
| sandboxMorpho | `0x5081a39b8A5f0E35a8D959395a630b68B74Dd30f` |
| propPool | `0x4a057D0eaA196191D22150F22EbBA8703E8ce165` |
| riskGuard | `0x922D6956C99E12DFeB3224DEA977D0939758A1Fe` |
| swapAdapter | `0x51A1ceB83B83F1985a81C295d1fF28Afef186E02` |
