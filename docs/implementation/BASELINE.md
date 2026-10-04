# Baseline

Recorded before the EVM protocol modules were added. This file describes the repository as it existed on branch `cursor/nectar-testnet-prototype-3d1a` at commit `056b97c` (`Use OpenZeppelin, the official brand, Paxos USDG, GMX, and ZeroDev.`). It is not a claim about the new modules.

## Implemented

- Rehearsal escrow, quotes, and executor. Sources: `contracts/src/NectarEscrow.sol`, `contracts/src/NectarQuotes.sol`, `contracts/src/NectarExecutor.sol`, `contracts/src/QuoteLib.sol`. Foundry tests in `contracts/test/Nectar.t.sol`. OpenZeppelin Contracts v5.6.1 is vendored at `contracts/lib/openzeppelin-contracts` and used for `ReentrancyGuard`, `Pausable`, `Ownable2Step`, `SafeERC20`, and `EIP712`.
- Single-market rehearsal fixture, explicitly not Morpho Blue: `contracts/src/RehearsalMarket.sol`. Pause guardian: `contracts/src/PauseGuardian.sol`.
- Local Anvil rehearsal manifest: `deployments/local.json` (chain id 31337). Startup script: `scripts/dev-up.sh`. Deploy script: `scripts/deploy-anvil.sh`.
- API (Hono) with `/health`, markets, workspace, and jobs. SQLite via `node:sqlite` in `api/src/db.ts`. Docker is not installed in this environment, so Postgres is not running.
- Next.js app in `web/` with Overview, Markets, Liquidity, Executions, Analytics, and Settings. Production site `https://nectar-network.vercel.app` exists. Its API rewrite targets the local API (`web/next.config.ts`, `API_PROXY` default `http://127.0.0.1:8787`). No new public API URL is claimed.
- Official Paxos USDG reads, 6 decimals, in `shared/officialDebt.ts` and `deployments/robinhood-testnet.json`:
  - Robinhood Chain testnet: `0x7E955252E15c84f5768B83c41a71F9eba181802F`
  - Arbitrum Sepolia: `0xFFC95faa3d63Cde504a05B567C600B78C0b41892`
- Robinhood Chain testnet (chain id 46630) rehearsal deployment is live. Manifest: `deployments/robinhood-testnet.json`. This bytecode is the earlier rehearsal set, not the protocol modules in `packages/contracts`.

| Contract | Address |
| --- | --- |
| Escrow | `0xa91112a940eaC477e114c6Ed90d35F108693999a` |
| Quotes | `0xB5B19c8C80F11d5912d0ff16C5eE673bd0DFA332` |
| Executor | `0x6F05CaD318337AFB72A94092Cd88f8485a48D6EC` |
| Rehearsal market | `0xC1B0798cA4de3192b9db36cAbee8C891336D6b48` |
| Pause guardian | `0xd72E7bDf4603FB5Cd0355fB541A5c239ba11FEaD` |
| nUSD | `0xc436488f247f89d56d971ba60284a0929B177aA5` |
| nSTK | `0x2F4C92450a1A7B6485F2e144cc0A82A413E601A1` |

Liquidation transaction: `0x6d69978efa2ffffee2a4e442000ea6a85e1456e1eb9c2d54b452f8ad305333f1`.

- Brand marks in `web/public/brand/` (`nectar-mark.svg`, `nectar-mark-compact.svg`, `nectar-lockup.svg`). The mint drop is the logo.

## Partial

- EIP-712 quotes, full-cash reservation, expiry release, and pause-safe unreserved withdraw exist for the rehearsal types. The verifying contract is `NectarQuotes`, not an escrow. Registration is ECDSA-only (`contracts/src/NectarQuotes.sol`). There is no ERC-1271 path.
- Executor settlement of one rehearsal market, including the 10,000 / 10,140 fee fixture in `contracts/test/Nectar.t.sol`. No route selection, no PropAMM, no external swap adapter.
- Keeper job rows in SQLite (`api/src/db.ts`) without an in-flight transaction recovery worker.
- GMX ticker reference (`api/src/reference.ts`) and a ZeroDev Kernel client in Settings (`web/lib/zerodev.ts`). Neither is on the liquidation path.
- Root scripts are shell files (`scripts/dev-up.sh`, `scripts/deploy-sepolia.sh`). There is no pnpm workspace and no `pnpm contracts:test`.

## Missing

- `MarketRegistry`, `QuoteEscrow` (escrow as EIP-712 verifying contract), protocol `NectarExecutor` with bounded routes, `MorphoBlueAdapter`, `NectarPropAMM` / factory, `RiskGuard`, and an approved external swap adapter.
- Pinned Morpho Blue liquidation callback. No official Morpho market is wired. The rehearsal market is a Nectar fixture.
- Route numerical test: external output 9820 rejected against a 10000 requirement, quote 10040 failing the 10140 allocation, and an external route beating both Nectar routes.
- Foundry invariant tests for escrow solvency.
- SDK package, worker, Docusaurus app, `SECURITY.md`, threat model, known limitations, third-party notices.
- Ivory / forest / amber product UI. The current app is the dark terminal theme in `web/app/globals.css`.

## Blocked

- Arbitrum Sepolia (chain id 421614) is not deployed. There is no `deployments/arbitrum-sepolia.json`. On 2026-10-04 the deployer `0x031e038aeba717714dacC95F16d03234d722bCBb` had **0 wei** on `https://sepolia-rollup.arbitrum.io/rpc` (`cast balance`). `scripts/deploy-sepolia.sh` is the ready path once that account has gas. This check will be repeated before any Sepolia deploy attempt.
- No EVM audit. The Stellar Community Fund grant ($75,000) is project history and does not certify these contracts. This repository is `kunaldrall29/nectar-arb`, the EVM tree. Stellar contracts are not in this tree.
- Docker is not available, so a local Postgres service cannot be started. The durable local store remains SQLite (`api/src/db.ts`).
- Robinhood Chain testnet will not be redeployed as part of baseline. The live rehearsal stays in place until a deliberate new-module deploy verifies `eth_getCode`.

## Preserved

`contracts/` stays the Foundry root for the rehearsal sources until `packages/contracts` tests pass. Those sources are not deleted or flattened by this baseline.
