# Nectar founder demo narration

**Voice:** ambitious female founder (TTS). **Duration:** ~2 minutes.

---

Hi, I'm building **Nectar** — unified liquidation liquidity for lending markets.

Here's the problem: when a borrower becomes undercollateralized, someone has to repay debt and seize collateral **atomically**. Professional buyers want to bid for that collateral, but off-chain promises don't settle. Keepers need **funded**, **time-bounded** quotes they can actually execute.

**Nectar's USP** is simple: makers deposit cash in segregated escrow, sign EIP-712 quotes, and we **reserve** the full obligation onchain before any capacity is shown. Keepers simulate and submit bounded jobs; the executor settles debt, collateral, and fees in **one transaction** — or reverts.

We inherited learnings from our **Stellar pooled-liquidation work**, including a **~$75k grant**. The EVM stack is new code — **under security audit** — with testnet rehearsal volume already **$148k+ and growing**.

In this demo on **Arbitrum Sepolia**, you'll see our unified app: markets admitted in a registry, liquidity and funded quotes, and execution receipts reconciled by our indexer.

**Product-market fit:** lending operators get reliable execution coverage; makers earn collateral at agreed prices; keepers get explicit economics. No cross-chain balance illusions — every action is chain-bound.

That's Nectar: **funded bids, atomic settlement, honest receipts**. Thank you.
