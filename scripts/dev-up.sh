#!/usr/bin/env bash
# Starts Anvil, deploys if needed, and runs the API plus the Next.js app.
# The Anvil mnemonic below is Foundry's published default. Demo signing is refused
# unless the RPC reports chain id 31337.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${HOME}/.foundry/bin:${PATH}"
RPC="${RPC_URL:-http://127.0.0.1:8545}"
MNEMONIC="test test test test test test test test test test test junk"

if ! cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --silent >/tmp/nectar-anvil.log 2>&1 &
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break
    sleep 0.3
  done
fi

CHAIN="$(cast chain-id --rpc-url "$RPC")"
if [[ "$CHAIN" != "31337" ]]; then
  echo "Refusing demo startup on chain $CHAIN"
  exit 1
fi

ESCROW="$(python3 -c "import json; print(json.load(open('$ROOT/deployments/local.json'))['escrow'])")"
CODE="$(cast code "$ESCROW" --rpc-url "$RPC")"
if [[ "$CODE" == "0x" || ${#CODE} -lt 10 ]]; then
  "$ROOT/scripts/deploy-anvil.sh"
fi

export DEMO_MAKER_KEY="$(cast wallet private-key "$MNEMONIC" 1)"
export DEMO_KEEPER_KEY="$(cast wallet private-key "$MNEMONIC" 2)"
export RPC_URL="$RPC"
export MANIFEST="$ROOT/deployments/local.json"
export PORT="${PORT:-8787}"

if ! curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null; then
  (cd "$ROOT/api" && npx tsx src/index.ts >/tmp/nectar-api.log 2>&1 &)
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null && break
    sleep 0.4
  done
fi

echo "API http://127.0.0.1:${PORT}/health"
if ! curl -sf http://127.0.0.1:3000 >/dev/null; then
  (cd "$ROOT/web" && npx next dev -p 3000 >/tmp/nectar-web.log 2>&1 &)
fi
echo "Web http://127.0.0.1:3000"
