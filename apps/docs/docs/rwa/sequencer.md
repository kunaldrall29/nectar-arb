---
title: Sequencer grace
---

On chains that expose an Arbitrum-style sequencer uptime feed, `answer == 1` means the sequencer is down and prices are rejected. `answer == 0` means it is up. After it returns, prices stay invalid until `block.timestamp - startedAt` is greater than the grace period. The deployment default grace is 3600 seconds.

The local lab sets the sequencer feed to the zero address, so this check is skipped there. The unit test covers a mock feed. A fresh asset price does not bypass the grace window.
