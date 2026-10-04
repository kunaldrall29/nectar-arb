# Known limitations

- No EVM audit. A Stellar Community Fund grant of $75,000 is project history and does not certify these contracts, measure EVM revenue, or establish product-market fit.
- Arbitrum Sepolia (chain id 421614) is not deployed. The deployer `0x031e038aeba717714dacC95F16d03234d722bCBb` had 0 wei on `https://sepolia-rollup.arbitrum.io/rpc` at the last check. `pnpm deploy:contracts --network arbitrum-sepolia` prints `STILL ZERO` in that case.
- Robinhood Chain testnet (chain id 46630) hosts the earlier rehearsal bytecode, not the modules in `packages/contracts`, unless a later deploy updates the manifest after `eth_getCode`.
- The lab lending venue is Nectar Sandbox Morpho. It is not an official Morpho deployment. Its share price is 1:1.
- Local persistence is SQLite through `node:sqlite`. Docker is not available in this environment, so Postgres is not running. Job rows and an in-flight transaction hash survive a process restart in that file.
- The local fresh-price policy uses a one-day staleness window so a scenario can be run without racing the clock. The unit fixture for the fresh-price stock policy uses 120 seconds.
- The web app's API rewrite targets the local API. `https://nectar-network.vercel.app` is an existing frontend host, not a newly deployed API.
- Explorer verification was not run.
- Reorg handling beyond replaying logs from the manifest start block is not implemented.
