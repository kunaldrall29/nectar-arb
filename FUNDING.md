# Fund these addresses (Arbitrum Sepolia)

Nectar’s testnet rehearsal needs **Arbitrum Sepolia ETH** (chain ID **421614**).
Keys live only in gitignored `.secrets/*.key`. **Do not send mainnet ETH.**

---

## Deployer (contracts + mock market)

# 0xB1A974969D7e81E71573cBdB3f6d318601d64014

Send **0.15+ ETH** on Arbitrum Sepolia.

Explorer: https://sepolia.arbiscan.io/address/0xB1A974969D7e81E71573cBdB3f6d318601d64014

---

## Keeper (executeJob only — no escrow withdraw authority)

# 0x123a06CBd1125973b5E0Cecaf0D9B1EF574835D0

Send **0.05+ ETH** on Arbitrum Sepolia.

Explorer: https://sepolia.arbiscan.io/address/0x123a06CBd1125973b5E0Cecaf0D9B1EF574835D0

---

## Maker (optional, for a second funded bidder)

# 0x628298b2fb130fa9F4D714177858D9a0505c4E9d

Send **0.03+ ETH** if you want to run the UI deposit/quote flow from this wallet.

Explorer: https://sepolia.arbiscan.io/address/0x628298b2fb130fa9F4D714177858D9a0505c4E9d

---

Official public RPC: `https://sepolia-rollup.arbitrum.io/rpc`

After funding, from the repo root:

```bash
export PATH="$HOME/.foundry/bin:$PATH"
export DEPLOYER_PRIVATE_KEY=$(tr -d '\n' < .secrets/deployer.key)
export KEEPER_ADDRESS=$(tr -d '\n' < .secrets/keeper.address)
export KEEPER_PRIVATE_KEY=$(tr -d '\n' < .secrets/keeper.key)
export MAKER_PRIVATE_KEY=$(tr -d '\n' < .secrets/maker.key)
./scripts/deploy-sepolia.sh
```

Until gas arrives, the full stack runs against local Anvil (`./scripts/demo-local.sh`).
