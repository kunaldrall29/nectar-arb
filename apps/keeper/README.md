# Nectar keeper agent

A real operator process. It has **no escrow withdraw authority**. It can only submit `executeJob` if the keeper allowlist includes its address.

## What it does

1. Reloads the deployment manifest and any in-flight transaction from `data/keeper-state.json`.
2. If a previous broadcast is still pending, it waits — it does not create a duplicate nonce.
3. Reads the MOCK Morpho position. If healthy, it idles.
4. Loads `data/active-quote.json` written by the seed script (or by a maker API).
5. Checks the onchain reservation is still reserved and unexpired.
6. Calls `previewJob`. Maker route is compared with the AMM estimate inside the contract.
7. Submits `executeJob` and waits for inclusion.

## Run

```bash
export KEEPER_PRIVATE_KEY=$(tr -d '\n' < .secrets/keeper.key)
export CHAIN_ID=31337          # or 421614
export RPC_URL=http://127.0.0.1:8545
export KEEPER_POLL_MS=4000
npm run keeper                 # from repo root
# or a single pass:
npm run once --workspace=apps/keeper
```

Create an unhealthy position + funded quote first:

```bash
./scripts/demo-local.sh        # Anvil
# or, after testnet gas:
./scripts/deploy-sepolia.sh
```

The seed script can fill immediately. To let the keeper fill instead:

```bash
SEED_SKIP_EXECUTE=1 node scripts/seed-and-fill.mjs
npm run keeper
```

Start the keeper while the quote is still inside its 30–120s window.

Default quote lifetime for the rehearsal is ~110 seconds so a human can watch the UI.
