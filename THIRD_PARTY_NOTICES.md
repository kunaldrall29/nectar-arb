# Third-party notices

- OpenZeppelin Contracts v5.6.1, MIT license, vendored at `contracts/lib/openzeppelin-contracts`. Used by the protocol modules and the earlier rehearsal contracts.
- Foundry `forge-std`, used for tests and the deploy script. See `contracts/lib/forge-std`.
- Morpho Blue (GPL-2.0-or-later) is the source of the pinned `liquidate` callback order: collateral transfer, then `onMorphoLiquidate(uint256,bytes)`, then the loan-token pull. The upstream sources are not copied into this tree. `NectarSandboxMorpho` is an independent implementation with that callback order and 1:1 shares. It is not an official Morpho deployment.
- viem, MIT, used by the API, SDK examples, and scenario runner.
- Hono and `@hono/node-server`, MIT, used by the API.
- Next.js and React, used by `web/`.
- Docusaurus 3, used by `apps/docs`.
- Paxos USDG is an external token read at the addresses in the deployment manifests. This repository does not deploy it and does not name a mock token USDG.

No other sponsored SDK is required to run the local scenarios.
