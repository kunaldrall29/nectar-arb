#!/usr/bin/env bash
set -euo pipefail
export PATH="$PATH:/home/ubuntu/.foundry/bin"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/packages/contracts"

RPC="${ARBITRUM_SEPOLIA_RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"
PK="${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY required}"

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC" \
  --broadcast \
  --via-ir \
  -vvv 2>&1 | tee /tmp/nectar-deploy.log

LATEST="$ROOT/packages/contracts/broadcast/Deploy.s.sol/421614/run-latest.json"
if [[ ! -f "$LATEST" ]]; then
  echo "Deploy broadcast file missing; check /tmp/nectar-deploy.log"
  exit 1
fi

node "$ROOT/scripts/write-manifest.mjs" "$LATEST"
