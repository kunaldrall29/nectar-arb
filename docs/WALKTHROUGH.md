# Nectar walkthrough

## What shipped
R1 vertical slice of the unified Nectar PRD (EVM): funded maker quotes → atomic liquidation settlement → product UI → deploy agent.

## Deploy wallet (fund for public Sepolia)
**`0xa6CdB06Dc088Fa28cE1b170309f34e8dB739AF74`**  
Secret (gitignored): `.secrets/DEPLOYER_PRIVATE_KEY.txt`  
Runbook: `agent/DEPLOY_AGENT.md`

Faucets: QuickNode / Alchemy Arbitrum Sepolia. Balance was **0** at prototype time, so public Sepolia broadcast is blocked until funded. Local anvil deploy is verified end-to-end.

## Local contract addresses (anvil, chainId 421614)
From `deployments/latest.json`:

| Contract | Address |
|---|---|
| MOCK_DEBT_TOKEN (nUSD) | `0x0B142C05aA1F79Ff34A17b8Bb4Bf088bD4B2BC19` |
| MOCK_COLLATERAL_TOKEN (tAAPL) | `0xC47073346BD25DDB01a4Ae3961e308613D4c38B9` |
| MOCK_LENDING | `0xd60a93d1016d4eAeA4523FB8831915d6c20A5D54` |
| QUOTE_ESCROW | `0xbAB2B1c9FbbA1cEe043CD0EF44eA52301fD53043` |
| MARKET_REGISTRY | `0x88BF65D4263c9457f5dD782dB1b27d3f65a1Ad3d` |
| RISK_GUARD | `0x90E31aCC1c0f286E0ae18713Ab46AE11368BeFd6` |
| NECTAR_EXECUTOR | `0x8DAB391B68D9F54D8AFcE037544cB402a0f743a5` |
| MORPHO_ADAPTER | `0x586031dD61CaD1Fece00A42914A58A1B5ad0ef22` |

After funding: `./scripts/deploy.sh arbitrum-sepolia` refreshes this manifest for Sepolia.

## Backend
```bash
cd backend && npm install
RPC_URL=http://127.0.0.1:8545 npm start   # :4000
```
Verified: `POST /v1/demo/run-liquidation` → status `success` (deposit → EIP-712 reserve → execute → receipt).

## Frontend
```bash
cd frontend && npm install && npm run dev
```
Vercel temporary deployment (claim to keep):  
**https://temporary-instant-nebula-p024e3r.vercel.app**  
Claim: https://vercel.com/claim-deployment?code=00a829ae-01f7-4eb5-88ce-bf18c0dbdc42  

(Anonymous deploy expires ~1h unless claimed; CLI was logged out of a persistent account.)

## Demo artifacts
- `/opt/cursor/artifacts/nectar_founder_demo.mp4` — founder narrative + UI walkthrough, female TTS (`en-US-JennyNeural`)
- `/opt/cursor/artifacts/founder_voice_female.mp3`
- Screenshots: hero, demo settled, analytics traction, executions

## Tests
`cd contracts && forge test --via-ir` → 5/5 including Section 9 numerical fixture.

## Artifacts (Cloud Agent)
- `nectar_founder_demo.mp4` — full founder narrative (~96s) with female TTS over product screens
- `nectar_live_ui_walkthrough.mp4` — live headed-browser UI capture
- `nectar_live_ui_with_founder_audio.mp4` — live UI + founder voice (first ~32s)
- Screenshots: `screenshot_hero.png`, `screenshot_demo_settled.png`, `screenshot_analytics_traction.png`, `screenshot_executions.png`

## PR
Branch pushed: `cursor/nectar-testnet-prototype-975f`  
Open PR: https://github.com/kunaldrall29/nectar-arb/pull/new/cursor/nectar-testnet-prototype-975f  
(`gh pr create` returned 403 for this integration token; ManagePullRequest tool unavailable in session.)
