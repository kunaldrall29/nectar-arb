#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="${SOURCE:-nectar-deployer}"
NETWORK="${NETWORK:-testnet}"
MANIFEST="$ROOT/deployments/testnet.json"

ADMIN=$(jq -r .deployer "$MANIFEST")
DEBT=$(jq -r .contracts.debtToken "$MANIFEST")
COLL=$(jq -r .contracts.collateralToken "$MANIFEST")
LENDING=$(jq -r .contracts.mockLending "$MANIFEST")
ESCROW=$(jq -r .contracts.quoteEscrow "$MANIFEST")
EXECUTOR=$(jq -r .contracts.nectarExecutor "$MANIFEST")
MARKET=$(jq -r .marketKey "$MANIFEST")

DEBT_REPAY=$(jq -r .fixture.debtRepay "$MANIFEST")
CASH_OUT=$(jq -r .fixture.cashOut "$MANIFEST")
KEEPER_COMP=$(jq -r .fixture.keeperCompensation "$MANIFEST")
PROTOCOL_FEE=$(jq -r .fixture.protocolFee "$MANIFEST")
MIN_SURPLUS=$(jq -r .fixture.minNetSurplus "$MANIFEST")
COLL_AMT=$(jq -r .fixture.collateralAmount "$MANIFEST")

# Mint debt to maker (admin) and collateral to borrower (admin for demo)
echo "==> Minting tokens"
stellar contract invoke --id "$DEBT" --source-account "$SOURCE" --network "$NETWORK" -- \
  mint --to "$ADMIN" --amount 500000000000
stellar contract invoke --id "$COLL" --source-account "$SOURCE" --network "$NETWORK" -- \
  mint --to "$ADMIN" --amount 5000000000

echo "==> Opening unhealthy position"
POSITION_ID=$(stellar contract invoke --id "$LENDING" --source-account "$SOURCE" --network "$NETWORK" -- \
  open_position \
    --borrower "$ADMIN" \
    --debt_token "$DEBT" \
    --collateral_token "$COLL" \
    --debt_amount "$DEBT_REPAY" \
    --collateral_amount "$COLL_AMT" \
    --health_factor_bps 8500 | tr -d '"')
echo "Position ID: $POSITION_ID"
echo "$POSITION_ID" > "$ROOT/deployments/demo_position_id.txt"

echo "==> Depositing maker cash"
stellar contract invoke --id "$ESCROW" --source-account "$SOURCE" --network "$NETWORK" -- \
  deposit --token "$DEBT" --amount 200000000000 --beneficiary "$ADMIN"

echo "==> Registering funded quote (120s TTL for demo)"
QUOTE_ID=$(stellar contract invoke --id "$ESCROW" --source-account "$SOURCE" --network "$NETWORK" -- \
  register_quote \
    --maker "$ADMIN" \
    --market_key "$MARKET" \
    --position_id "$POSITION_ID" \
    --collateral_amount "$COLL_AMT" \
    --cash_out "$CASH_OUT" \
    --max_debt_repay "$DEBT_REPAY" \
    --collateral_recipient "$ADMIN" \
    --keeper_compensation "$KEEPER_COMP" \
    --protocol_fee "$PROTOCOL_FEE" \
    --min_net_surplus "$MIN_SURPLUS" \
    --keeper_recipient "$ADMIN" \
    --surplus_recipient "$ADMIN" \
    --ttl_seconds 120 | tr -d '"')
echo "Quote ID: $QUOTE_ID"
echo "$QUOTE_ID" > "$ROOT/deployments/demo_quote_id.txt"

echo "==> Available cash after reservation"
stellar contract invoke --id "$ESCROW" --source-account "$SOURCE" --network "$NETWORK" -- \
  available_cash --maker "$ADMIN" --token "$DEBT"

echo "✅ Demo seeded"
