# Fund the Nectar deploy wallet

## Public address
```
0xa6CdB06Dc088Fa28cE1b170309f34e8dB739AF74
```

## Secret storage (never commit)
- `.secrets/DEPLOYER_PRIVATE_KEY.txt`
- `.secrets/deployer.json`
- `.secrets/DEPLOYER_ADDRESS.txt`

## Steps
1. Send Arbitrum Sepolia ETH to the address above.
2. `cast balance 0xa6CdB06Dc088Fa28cE1b170309f34e8dB739AF74 --rpc-url https://sepolia-rollup.arbitrum.io/rpc`
3. `./scripts/deploy.sh arbitrum-sepolia`
4. Restart backend; refresh frontend env / Vercel.

## Agent
See `agent/DEPLOY_AGENT.md`.
