#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
: "${DEPLOYER_PRIVATE_KEY:?Set DEPLOYER_PRIVATE_KEY}"
: "${ARBITRUM_SEPOLIA_RPC_URL:?Set ARBITRUM_SEPOLIA_RPC_URL}"
cd "$(dirname "$0")/.."
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL" \
  --broadcast \
  --verify \
  --etherscan-api-key "${ETHERSCAN_API_KEY:-}"
