#!/usr/bin/env bash
# Deploys the rehearsal slice to Arbitrum Sepolia (chain id 421614).
# Reads the key from .secrets/deployer.key. Never prints the key.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${HOME}/.foundry/bin:${PATH}"
RPC="${RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"
KEYFILE="$ROOT/.secrets/deployer.key"
if [[ ! -f "$KEYFILE" ]]; then
  echo "Missing $KEYFILE"
  echo "Fund the address in DEPLOYER_ADDRESS.txt, put the hex key in that file (chmod 600), and rerun."
  exit 1
fi
KEY="$(tr -d '[:space:]' < "$KEYFILE")"
if [[ "$KEY" != 0x* ]]; then
  KEY="0x${KEY}"
fi
export PRIVATE_KEY="$KEY"
unset KEY
export GIT_COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
cd "$ROOT/contracts"
forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast --slow
python3 - "$ROOT" "$RPC" << 'PY'
import json, sys
from pathlib import Path
root = Path(sys.argv[1])
manifest = json.loads((root / "contracts/deployments/latest.json").read_text())
broadcast = root / "contracts/broadcast/Deploy.s.sol/421614/run-latest.json"
start = None
txs = []
if broadcast.exists():
    run = json.loads(broadcast.read_text())
    for receipt in run.get("receipts") or []:
        block = receipt.get("blockNumber")
        if isinstance(block, str):
            block = int(block, 16) if block.startswith("0x") else int(block)
        if start is None or block < start:
            start = block
        txs.append({
            "hash": receipt.get("transactionHash"),
            "blockNumber": block,
            "status": receipt.get("status"),
        })
if start is not None:
    manifest["startBlock"] = start
manifest["environment"] = "testnet"
manifest["networkName"] = "Arbitrum Sepolia"
manifest["transactions"] = txs
manifest["notes"] = [
    "Hackathon prototype, R1 single-deployment slice on Arbitrum Sepolia.",
    "Rehearsal market is not Morpho Blue.",
    "EVM contracts are a new implementation and are not audited.",
    "Prior Stellar work does not certify this deployment.",
    "Robinhood Chain testnet is not deployed in this slice.",
]
out = root / "deployments/arbitrum-sepolia.json"
out.write_text(json.dumps(manifest, indent=2) + "\n")
print(f"wrote {out}")
print(f"chainId {manifest.get('chainId')} escrow {manifest.get('escrow')}")
PY
