#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NETWORK="${NETWORK:-testnet}"
SOURCE="${SOURCE:-nectar-deployer}"
OUT_DIR="$ROOT/deployments"
WASM_DIR="$ROOT/contracts/target/wasm32v1-none/release"

mkdir -p "$OUT_DIR"
cd "$ROOT/contracts"
stellar contract build

deploy_wasm() {
  local wasm="$1"
  stellar contract deploy \
    --wasm "$wasm" \
    --source-account "$SOURCE" \
    --network "$NETWORK" \
    | tee /dev/stderr \
    | grep -oE 'C[A-Z0-9]{55}' \
    | tail -n1
}

echo "==> Deploying tokens"
DEBT_ID=$(deploy_wasm "$WASM_DIR/nectar_token.wasm")
COLL_ID=$(deploy_wasm "$WASM_DIR/nectar_token.wasm")
echo "$DEBT_ID" > "$OUT_DIR/debt_token_id.txt"
echo "$COLL_ID" > "$OUT_DIR/collateral_token_id.txt"

echo "==> Deploying core contracts"
LENDING_ID=$(deploy_wasm "$WASM_DIR/mock_lending.wasm")
ESCROW_ID=$(deploy_wasm "$WASM_DIR/quote_escrow.wasm")
EXECUTOR_ID=$(deploy_wasm "$WASM_DIR/nectar_executor.wasm")
echo "$LENDING_ID" > "$OUT_DIR/mock_lending_id.txt"
echo "$ESCROW_ID" > "$OUT_DIR/quote_escrow_id.txt"
echo "$EXECUTOR_ID" > "$OUT_DIR/nectar_executor_id.txt"

ADMIN=$(stellar keys address "$SOURCE")
echo "Admin/deployer: $ADMIN"
echo "$ADMIN" > "$OUT_DIR/deployer_address.txt"

echo "==> Initializing"
MARKET_KEY="stellar-morpho-aapl-1"
stellar contract invoke --id "$DEBT_ID" --source-account "$SOURCE" --network "$NETWORK" -- \
  initialize --admin "$ADMIN" --name "Nectar USD" --symbol "nUSD" --decimals 7
stellar contract invoke --id "$COLL_ID" --source-account "$SOURCE" --network "$NETWORK" -- \
  initialize --admin "$ADMIN" --name "Tokenized AAPL" --symbol "nAAPL" --decimals 7
stellar contract invoke --id "$LENDING_ID" --source-account "$SOURCE" --network "$NETWORK" -- \
  initialize --admin "$ADMIN" --market_key "$MARKET_KEY"
stellar contract invoke --id "$ESCROW_ID" --source-account "$SOURCE" --network "$NETWORK" -- \
  initialize --admin "$ADMIN" --guardian "$ADMIN"
stellar contract invoke --id "$EXECUTOR_ID" --source-account "$SOURCE" --network "$NETWORK" -- \
  initialize --admin "$ADMIN" --escrow "$ESCROW_ID" --protocol_treasury "$ADMIN"
stellar contract invoke --id "$LENDING_ID" --source-account "$SOURCE" --network "$NETWORK" -- \
  set_executor --executor "$EXECUTOR_ID"
stellar contract invoke --id "$ESCROW_ID" --source-account "$SOURCE" --network "$NETWORK" -- \
  set_executor --executor "$EXECUTOR_ID"
stellar contract invoke --id "$ESCROW_ID" --source-account "$SOURCE" --network "$NETWORK" -- \
  admit_market \
    --market_key "$MARKET_KEY" \
    --lending_protocol "$LENDING_ID" \
    --debt_token "$DEBT_ID" \
    --collateral_token "$COLL_ID" \
    --adapter_version 1 \
    --policy_version 1

cat > "$OUT_DIR/testnet.json" <<EOF
{
  "network": "testnet",
  "networkPassphrase": "Test SDF Network ; September 2015",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "horizonUrl": "https://horizon-testnet.stellar.org",
  "deployer": "$ADMIN",
  "marketKey": "$MARKET_KEY",
  "contracts": {
    "debtToken": "$DEBT_ID",
    "collateralToken": "$COLL_ID",
    "mockLending": "$LENDING_ID",
    "quoteEscrow": "$ESCROW_ID",
    "nectarExecutor": "$EXECUTOR_ID"
  },
  "decimals": 7,
  "fixture": {
    "debtRepay": "100000000000",
    "cashOut": "101400000000",
    "keeperCompensation": "500000000",
    "protocolFee": "200000000",
    "minNetSurplus": "700000000",
    "collateralAmount": "500000000"
  }
}
EOF

echo "✅ Wrote $OUT_DIR/testnet.json"
cat "$OUT_DIR/testnet.json"
