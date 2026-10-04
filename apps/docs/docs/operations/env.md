---
title: Environment check
---

```bash
pnpm env:check
```

The check prints Node, Forge, pnpm, whether Docker is available, the chain allowlist (31337, 421614, 46630), and the Arbitrum Sepolia deployer balance.

Local persistence is SQLite when Docker is absent. Do not describe that process as Postgres.
