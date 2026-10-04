#!/usr/bin/env bash
# Deploys the rehearsal slice to a local Anvil node (chain id 31337).
# Uses Foundry's published default development mnemonic. This is not a secret
# and the API refuses demo signing unless the connected chain id is 31337.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${HOME}/.foundry/bin:${PATH}"
RPC="${RPC_URL:-http://127.0.0.1:8545}"
MNEMONIC="test test test test test test test test test test test junk"

if ! cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "Anvil is not reachable at $RPC"
  exit 1
fi
CHAIN="$(cast chain-id --rpc-url "$RPC")"
if [[ "$CHAIN" != "31337" ]]; then
  echo "Refusing to use the Anvil development key on chain $CHAIN"
  exit 1
fi

export PRIVATE_KEY="$(cast wallet private-key "$MNEMONIC" 0)"
export GIT_COMMIT="$(git -C "$ROOT" rev-parse HEAD)"
cd "$ROOT/contracts"
forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast
python3 - "$ROOT" << 'PY'
import json, sys
from pathlib import Path
root = Path(sys.argv[1])
manifest = json.loads((root / "contracts/deployments/latest.json").read_text())
manifest["startBlock"] = 0
manifest["environment"] = "testnet"
manifest["networkName"] = "Local Anvil"
manifest["notes"] = [
    "Hackathon prototype, R1 single-deployment slice.",
    "Local Anvil rehearsal of the Arbitrum Sepolia product shape. Not Arbitrum Sepolia itself.",
    "Rehearsal market is not Morpho Blue.",
    "EVM contracts are a new implementation and are not audited.",
    "Prior Stellar work does not certify this deployment.",
]
text = json.dumps(manifest, indent=2) + "\n"
(root / "contracts/deployments/latest.json").write_text(text)
(root / "deployments/local.json").write_text(text)
print(text)
PY
