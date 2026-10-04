#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NETWORK="${STELLAR_NETWORK:-testnet}"
SOURCE="${STELLAR_SOURCE:-nectar-admin}"
ADMIN="$(stellar keys address "$SOURCE")"

echo "Admin: $ADMIN"
echo "Network: $NETWORK"

deploy() {
  local wasm="$1"
  local alias="$2"
  echo "Deploying $alias from $wasm"
  stellar contract deploy \
    --wasm "$wasm" \
    --source-account "$SOURCE" \
    --network "$NETWORK" \
    --alias "$alias" | tail -1
}

USDC_WASM=target/wasm32v1-none/release/mock_token.wasm
LAB_WASM=target/wasm32v1-none/release/mock_lending.wasm
CORE_WASM=target/wasm32v1-none/release/nectar_core.wasm

USDC="$(deploy "$USDC_WASM" nectar-usdc)"
echo "USDC=$USDC"
HOOD="$(deploy "$USDC_WASM" nectar-hood)"
echo "HOOD=$HOOD"
LAB="$(deploy "$LAB_WASM" nectar-lab)"
echo "LAB=$LAB"
CORE="$(deploy "$CORE_WASM" nectar-core)"
echo "CORE=$CORE"

invoke() {
  local id="$1"
  shift
  stellar contract invoke --id "$id" --source "$SOURCE" --network "$NETWORK" --send=yes -- "$@"
}

echo "Initializing tokens..."
invoke "$USDC" initialize --admin "$ADMIN" --name "Nectar USD" --symbol "USDC" --decimals 7
invoke "$HOOD" initialize --admin "$ADMIN" --name "Robinhood mock" --symbol "HOOD" --decimals 7
invoke "$LAB" initialize --admin "$ADMIN"
invoke "$CORE" initialize --admin "$ADMIN" --guardian "$ADMIN" --fee_recipient "$ADMIN"

MARKET_KEY="0707070707070707070707070707070707070707070707070707070707070707"
echo "Admitting HOOD/USDC market..."
invoke "$CORE" admit_market \
  --admin "$ADMIN" \
  --market_key "$MARKET_KEY" \
  --chain_id 1000 \
  --protocol lab \
  --market_id HOOD_USDC \
  --debt_token "$USDC" \
  --collateral_token "$HOOD" \
  --adapter "$LAB" \
  --policy_version 1 \
  --max_quote_ttl 300

mkdir -p "$ROOT/deploy"
cat > "$ROOT/deploy/manifest.json" <<EOF
{
  "network": "testnet",
  "networkPassphrase": "Test SDF Network ; September 2015",
  "horizon": "https://horizon-testnet.stellar.org",
  "rpc": "https://soroban-testnet.stellar.org",
  "explorer": "https://stellar.expert/explorer/testnet",
  "chainId": 1000,
  "stage": "R1-stellar-testnet-slice",
  "admin": "$ADMIN",
  "contracts": {
    "usdc": "$USDC",
    "hood": "$HOOD",
    "lending": "$LAB",
    "nectar": "$CORE"
  },
  "marketKey": "$MARKET_KEY",
  "policy": {
    "maxQuoteTtlSeconds": 300,
    "decimals": 7,
    "fixture": {
      "debtRepay": "100000000000",
      "cashOut": "101400000000",
      "keeper": "500000000",
      "protocolFee": "200000000",
      "surplus": "700000000",
      "collateral": "120000000000"
    }
  }
}
EOF

echo "Wrote deploy/manifest.json"
cat "$ROOT/deploy/manifest.json"
