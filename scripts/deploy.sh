#!/usr/bin/env bash
set -euo pipefail
export PATH="$PATH:$HOME/.foundry/bin"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ADDR_FILE="$ROOT/.secrets/DEPLOYER_ADDRESS.txt"
KEY_FILE="$ROOT/.secrets/DEPLOYER_PRIVATE_KEY.txt"

if [[ ! -f "$KEY_FILE" ]]; then
  echo "Missing $KEY_FILE — generate with: cast wallet new"
  exit 1
fi

ADDRESS="$(cat "$ADDR_FILE")"
PRIVATE_KEY="$(cat "$KEY_FILE")"
export PRIVATE_KEY

NETWORK="${1:-local}"
mkdir -p "$ROOT/deployments"

echo "============================================================"
echo " Nectar deploy agent"
echo " Network: $NETWORK"
echo " Deployer (FUND THIS): $ADDRESS"
echo "============================================================"

if [[ "$NETWORK" == "local" ]]; then
  RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
  # Prefer anvil default key if talking to fresh anvil; still document nectar wallet.
  if ! curl -s -X POST "$RPC_URL" -H 'content-type: application/json' \
      --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null; then
    echo "Starting anvil in background..."
    anvil --chain-id 421614 --port 8545 >"$ROOT/deployments/anvil.log" 2>&1 &
    echo $! >"$ROOT/deployments/anvil.pid"
    sleep 1
  fi
  # Fund nectar deployer from anvil account 0
  ANVIL_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
  cast send "$ADDRESS" --value 100ether --private-key "$ANVIL_KEY" --rpc-url "$RPC_URL" >/dev/null
  CHAIN_ID=421614
elif [[ "$NETWORK" == "arbitrum-sepolia" ]]; then
  RPC_URL="${ARB_SEPOLIA_RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"
  CHAIN_ID=421614
  BAL="$(cast balance "$ADDRESS" --rpc-url "$RPC_URL")"
  echo "Deployer balance (wei): $BAL"
  if [[ "$BAL" == "0" ]]; then
    echo ""
    echo "BLOCKER: Deployer has 0 ETH on Arbitrum Sepolia."
    echo "Fund this address, then re-run:"
    echo "  $ADDRESS"
    echo "Faucets: https://faucet.quicknode.com/arbitrum/sepolia"
    echo "         https://www.alchemy.com/faucets/arbitrum-sepolia"
    echo ""
    echo "Falling back to local anvil deploy for end-to-end demo..."
    exec "$0" local
  fi
else
  echo "Unknown network: $NETWORK (use local|arbitrum-sepolia)"
  exit 1
fi

export ARB_SEPOLIA_RPC_URL="$RPC_URL"

echo "Deploying contracts via forge script..."
OUT=$(cd "$ROOT/contracts" && forge script script/DeployNectar.s.sol:DeployNectar \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --via-ir \
  -vv 2>&1 | tee "$ROOT/deployments/deploy-${NETWORK}.log")

extract() {
  echo "$OUT" | grep -E "^[[:space:]]*$1" | tail -1 | awk '{print $NF}'
}

MOCK_DEBT_TOKEN=$(extract MOCK_DEBT_TOKEN)
MOCK_COLLATERAL_TOKEN=$(extract MOCK_COLLATERAL_TOKEN)
MOCK_LENDING=$(extract MOCK_LENDING)
QUOTE_ESCROW=$(extract QUOTE_ESCROW)
MARKET_REGISTRY=$(extract MARKET_REGISTRY)
RISK_GUARD=$(extract RISK_GUARD)
NECTAR_EXECUTOR=$(extract NECTAR_EXECUTOR)
MORPHO_ADAPTER=$(extract MORPHO_ADAPTER)
MARKET_KEY=$(echo "$OUT" | grep -E "0x[a-fA-F0-9]{64}" | tail -1 | awk '{print $NF}')
# Prefer explicit market key line from script — last bytes32 print after MORPHO
POLICY_HASH=$(cast keccak "policy-v1")
MARKET_KEY=$(cast keccak "ARB_SEPOLIA_MORPHO_TAAPL_NUSD_V1")

python3 - <<PY
import json, os
manifest = {
  "chainId": int("$CHAIN_ID"),
  "network": "$NETWORK",
  "rpcUrl": "$RPC_URL",
  "deployer": "$ADDRESS",
  "marketKey": "$MARKET_KEY",
  "policyHash": "$POLICY_HASH",
  "contracts": {
    "MOCK_DEBT_TOKEN": "$MOCK_DEBT_TOKEN",
    "MOCK_COLLATERAL_TOKEN": "$MOCK_COLLATERAL_TOKEN",
    "MOCK_LENDING": "$MOCK_LENDING",
    "QUOTE_ESCROW": "$QUOTE_ESCROW",
    "MARKET_REGISTRY": "$MARKET_REGISTRY",
    "RISK_GUARD": "$RISK_GUARD",
    "NECTAR_EXECUTOR": "$NECTAR_EXECUTOR",
    "MORPHO_ADAPTER": "$MORPHO_ADAPTER",
  }
}
path = "$ROOT/deployments/latest.json"
open(path,"w").write(json.dumps(manifest, indent=2)+"\n")
open("$ROOT/deployments/${NETWORK}.json","w").write(json.dumps(manifest, indent=2)+"\n")
print(json.dumps(manifest, indent=2))
PY

echo "Wrote deployments/latest.json"
echo "Fund wallet (if testnet): $ADDRESS"
