#!/usr/bin/env bash
# One-command deploy of the Nectar testnet slice.
#   bash scripts/deploy.sh local              # anvil on 127.0.0.1:8545 (default anvil key)
#   bash scripts/deploy.sh arbitrum-sepolia   # needs PRIVATE_KEY (or .secrets/deployer.env) with Arbitrum Sepolia ETH
#   bash scripts/deploy.sh robinhood-testnet  # needs PRIVATE_KEY with Robinhood Chain Testnet ETH
# Writes deployments/<chainId>.json, then regenerates ABIs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.foundry/bin:$PATH"
TARGET="${1:-local}"

if [[ -f "$ROOT/.secrets/deployer.env" && -z "${PRIVATE_KEY:-}" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/.secrets/deployer.env"
fi

VERIFY_ARGS=()
case "$TARGET" in
  local)
    RPC="${LOCAL_RPC_URL:-http://127.0.0.1:8545}"
    PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    ;;
  arbitrum-sepolia)
    RPC="${ARBITRUM_SEPOLIA_RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"
    if [[ -n "${ARBISCAN_API_KEY:-}" ]]; then
      VERIFY_ARGS=(--verify --etherscan-api-key "$ARBISCAN_API_KEY")
    fi
    ;;
  robinhood-testnet)
    RPC="${ROBINHOOD_TESTNET_RPC_URL:-https://rpc.testnet.chain.robinhood.com}"
    VERIFY_ARGS=(--verify --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/)
    ;;
  *) echo "unknown target $TARGET"; exit 1 ;;
esac

: "${PRIVATE_KEY:?PRIVATE_KEY is required}"
cd "$ROOT/contracts"
forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --private-key "$PRIVATE_KEY" --slow "${VERIFY_ARGS[@]}"
cd "$ROOT" && node scripts/gen-abis.mjs
echo "Done. Deployment manifest in deployments/."
