# Nectar

Unified liquidation liquidity. This repository is the **R1 Stellar testnet vertical slice** of the Nectar product: funded maker quotes, segregated escrow, atomic settlement, receipts, and the Nectar agent.

Arbitrum and Robinhood Chain are the same product vocabulary. They are labeled planned in the app. Funds never cross chains.

## Live Stellar testnet

| Item | Value |
|---|---|
| Network | `Test SDF Network ; September 2015` |
| Deploy admin | `GD5HJ4XVSEM5GFEVVVZE6CLO2FDOQXZADJWOZ5Q2M2XR345I73GGZBLN` |
| NectarCore | [`CDDI3F3X6IC76OFK4JCXO2UXJYEPAJP43HF5GCNUTFTI3ZR6GI5QUUN3`](https://stellar.expert/explorer/testnet/contract/CDDI3F3X6IC76OFK4JCXO2UXJYEPAJP43HF5GCNUTFTI3ZR6GI5QUUN3) |
| MockLending | [`CCRJJ2TGAJ743SI5OY4AMXRWEARDKUEUL4UPFQK2QETSWN7PKQ3VG2H5`](https://stellar.expert/explorer/testnet/contract/CCRJJ2TGAJ743SI5OY4AMXRWEARDKUEUL4UPFQK2QETSWN7PKQ3VG2H5) |
| USDC | [`CDU5BPZ4G2RWIM6X5UWMKRJEWH5F3OL5SWNNY6DR6SKZQFCTORHEGKDL`](https://stellar.expert/explorer/testnet/contract/CDU5BPZ4G2RWIM6X5UWMKRJEWH5F3OL5SWNNY6DR6SKZQFCTORHEGKDL) |
| HOOD | [`CDNG2O4IL2AP57GN2E23ECQS6ADA7WELLVLPDHDGGDVADPBU22C6GXGH`](https://stellar.expert/explorer/testnet/contract/CDNG2O4IL2AP57GN2E23ECQS6ADA7WELLVLPDHDGGDVADPBU22C6GXGH) |
| First fill | [`969bb595…`](https://stellar.expert/explorer/testnet/tx/969bb59510dc037af5b5bce7d3059267cb0e5cc5e868dbca909dbaf27d05e484) |

The first public rehearsal repaid **10,000 USDC**, delivered **12,000 HOOD**, and allocated **10,140 = 10,000 + 50 + 20 + 70**.

## Product loop

1. Maker deposits debt tokens into `NectarCore`.
2. Maker registers a single-fill quote. The full `cashOut` is reserved.
3. Keeper previews, then executes. The lab adapter seizes collateral; escrow pays debt, keeper, protocol fee, and surplus.
4. Receipt is on-chain. Expired quotes can be released; reserved cash cannot be withdrawn early.

## Repo

```
contracts/     Soroban (Rust, soroban-sdk 22)
frontend/      Next.js 14 app + /api/v1 backend + Nectar agent
deploy/        Public manifest and live rehearsal evidence
scripts/       Deploy helpers
```

```bash
# contracts
cargo test --workspace
cargo build --target wasm32v1-none --release

# app
cp .env.example frontend/.env.local   # add ADMIN_SECRET
cd frontend && npm install && npm run dev
```

## Secrets

The deploy keypair is **not** in git. Public address is above. Recreate or fund with Friendbot:

```
stellar keys generate nectar-admin --network testnet
curl "https://friendbot.stellar.org/?addr=$(stellar keys address nectar-admin)"
```
