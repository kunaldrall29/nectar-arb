---
title: Arbitrum Sepolia
---

Chain id 421614 is allowlisted. The deploy command is:

```bash
pnpm deploy:contracts --network arbitrum-sepolia
```

If the deployer `0x031e038aeba717714dacC95F16d03234d722bCBb` still has 0 wei on `https://sepolia-rollup.arbitrum.io/rpc`, the command prints `STILL ZERO` and does not write contract addresses.

Official Paxos USDG on this chain, for reads, is `0xFFC95faa3d63Cde504a05B567C600B78C0b41892` (6 decimals).
