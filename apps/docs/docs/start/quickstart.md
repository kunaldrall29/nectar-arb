---
title: Quickstart
---

From a checkout with Foundry and Node 22:

```bash
pnpm install --frozen-lockfile
pnpm contracts:build
pnpm contracts:test
pnpm local:bootstrap
pnpm scenario:run --network local --scenario funded-quote
pnpm scenario:run --network local --scenario propamm
pnpm dev
```

`pnpm dev` serves the API on port 8787 and the web app on port 3000. The web app reads that local API. It does not point at a new public API host.

The local lending venue is labeled Nectar Sandbox Morpho. See [Testnet Lab](../lab/local).
