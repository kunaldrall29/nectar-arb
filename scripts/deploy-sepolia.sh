#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CHAIN_ID=421614
export RPC_URL="${ARB_SEPOLIA_RPC:-https://sepolia-rollup.arbitrum.io/rpc}"
export DEPLOYER_PRIVATE_KEY=$(tr -d '\n' < .secrets/deployer.key)
export KEEPER_PRIVATE_KEY=$(tr -d '\n' < .secrets/keeper.key)
export MAKER_PRIVATE_KEY=$(tr -d '\n' < .secrets/maker.key)
export KEEPER_ADDRESS=$(tr -d '\n' < .secrets/keeper.address)
BAL=$(cast balance "$(tr -d '\n' < .secrets/deployer.address)" --rpc-url "$RPC_URL")
if [ "$BAL" = "0" ]; then
  echo "Deployer has 0 ETH on Arbitrum Sepolia. Fund 0x$(cut -c3- .secrets/deployer.address) and retry."
  echo "See FUNDING.md"
  exit 1
fi
cd contracts && forge build -q && cd ..
node scripts/deploy.mjs
node scripts/seed-and-fill.mjs
echo "Sepolia deploy complete. See deployments/arbitrum-sepolia.json"
