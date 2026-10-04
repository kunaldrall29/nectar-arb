#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! curl -s -m 1 http://127.0.0.1:8545 >/dev/null; then
  echo "Starting Anvil on :8545"
  anvil --chain-id 31337 --port 8545 > /tmp/nectar-anvil.log 2>&1 &
  echo $! > /tmp/nectar-anvil.pid
  sleep 1
fi

ANVIL_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
DEPLOYER=$(tr -d '\n' < .secrets/deployer.address)
KEEPER=$(tr -d '\n' < .secrets/keeper.address)
MAKER=$(tr -d '\n' < .secrets/maker.address)
export DEPLOYER_PRIVATE_KEY=$(tr -d '\n' < .secrets/deployer.key)
export KEEPER_PRIVATE_KEY=$(tr -d '\n' < .secrets/keeper.key)
export MAKER_PRIVATE_KEY=$(tr -d '\n' < .secrets/maker.key)
export CHAIN_ID=31337
export RPC_URL=http://127.0.0.1:8545

cast send "$DEPLOYER" --value 20ether --private-key "$ANVIL_KEY" --rpc-url "$RPC_URL" >/dev/null
cast send "$KEEPER" --value 5ether --private-key "$ANVIL_KEY" --rpc-url "$RPC_URL" >/dev/null
cast send "$MAKER" --value 5ether --private-key "$ANVIL_KEY" --rpc-url "$RPC_URL" >/dev/null

cd contracts && forge build -q && cd ..
node scripts/deploy.mjs
node scripts/seed-and-fill.mjs
echo "Local rehearsal complete. See deployments/anvil.json and deployments/local-e2e.json"
