# Nectar Deploy Agent

Operational instructions for deploying and operating the Nectar testnet prototype.

## Deploy wallet (fund this)

**Public address:** `0xa6CdB06Dc088Fa28cE1b170309f34e8dB739AF74`

- Secret key file (gitignored): `.secrets/DEPLOYER_PRIVATE_KEY.txt`
- JSON keypair (gitignored): `.secrets/deployer.json`

Never commit private keys. Copy into a local `.env` if needed:

```bash
export PRIVATE_KEY=$(cat .secrets/DEPLOYER_PRIVATE_KEY.txt)
```

### Fund on Arbitrum Sepolia

1. Copy the public address above.
2. Request Sepolia ETH bridged/native for Arbitrum Sepolia from:
   - https://faucet.quicknode.com/arbitrum/sepolia
   - https://www.alchemy.com/faucets/arbitrum-sepolia
3. Confirm balance:

```bash
cast balance 0xa6CdB06Dc088Fa28cE1b170309f34e8dB739AF74 \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

## Deploy contracts

```bash
# Local anvil (auto-starts + funds deployer)
./scripts/deploy.sh local

# Arbitrum Sepolia (requires funded wallet)
./scripts/deploy.sh arbitrum-sepolia
```

Manifest output: `deployments/latest.json`

## Run backend

```bash
cd backend && npm install && npm run dev
```

Env: see `.env.example`. Backend reads `../deployments/latest.json` and `.secrets/DEPLOYER_PRIVATE_KEY.txt`.

## Run frontend

```bash
cd frontend && npm install && npm run dev
```

## Demo happy path

```bash
curl -X POST http://localhost:4000/v1/demo/run-liquidation | jq
```

## Redeploy checklist

1. Fund deployer if needed
2. `./scripts/deploy.sh arbitrum-sepolia`
3. Restart backend
4. Update frontend `NEXT_PUBLIC_API_URL` / redeploy Vercel
5. Hit `/v1/deployment` to confirm addresses
