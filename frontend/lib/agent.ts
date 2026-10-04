import { LIVE, NETWORKS } from "./config";
import { fromBase, usd } from "./format";

type Snapshot = {
  wallet?: string;
  cash?: string;
  reserved?: string;
  network?: string;
  lastReceipt?: Record<string, unknown>;
};

export function agentReply(message: string, snap: Snapshot) {
  const q = message.toLowerCase();
  const cash = snap.cash ? usd(snap.cash) : "unknown until we read the escrow";
  const reserved = snap.reserved ? usd(snap.reserved) : "none observed";

  if (/who|what is nectar|usp|differen/.test(q)) {
    return {
      role: "agent",
      text: "Nectar is a liquidation liquidity network. The USP is a funded, time-bounded bid: a maker deposits cash, reserves an exact quote, and a keeper can consume that reservation inside one atomic settlement. Debt is repaid, collateral is delivered, fees are explicit — or the whole job reverts. We already proved that loop on Stellar testnet. Arbitrum and Robinhood Chain inherit the same vocabulary; funds never cross.",
    };
  }
  if (/pmf|product.market|traction|grant|audit|volume/.test(q)) {
    return {
      role: "agent",
      text: "We already have product-market fit with lending operators who cannot depend on a single liquidation bot. Stellar backed that thesis with a $75,000 Community Fund grant. The contracts are under security audit, and testnet volume is $148k+ and growing. This workspace is how we grow the same product onto stock-collateral markets.",
    };
  }
  if (/deposit|fund|add funds|liquidity/.test(q)) {
    return {
      role: "agent",
      text: `Maker cash is segregated per chain and token. Your observed escrow cash is ${cash}; reserved commitments are ${reserved}. A signature is not capacity — the quote is executable only after on-chain registration. Open Liquidity, add USDC, then publish a quote against an eligible borrower.`,
    };
  }
  if (/quote|bid|reserv/.test(q)) {
    return {
      role: "agent",
      text: "A V1 quote is single-fill and exact. You commit cashOut, maxDebtRepay, collateral size, recipients, fees, and an expiry. Testnet policy allows up to 300 seconds so a human can finish the demo; production V1 is 30–120 seconds. Early withdraw cannot spend reserved cash. After expiry anyone may release the reservation back to you.",
    };
  }
  if (/execute|keeper|liquidat/.test(q)) {
    return {
      role: "agent",
      text: `Keepers simulate first. If debt, quote, or price moved, we refuse with a named code — never a partial settle. The live rehearsal already filled quote ${LIVE.quoteId.slice(0, 8)}… with 10,000 USDC repaid, 12,000 HOOD delivered, and 10,140 USDC allocated 10,000 / 50 / 20 / 70. I can explain a receipt; I cannot authorize a spend.`,
    };
  }
  if (/arbitrum|robinhood|network|chain/.test(q)) {
    const live = NETWORKS.filter((n) => n.status === "live").map((n) => n.name).join(", ");
    return {
      role: "agent",
      text: `${live} is the live settlement environment in this slice. Arbitrum and Robinhood Chain are the same product, not a shared balance sheet. 100 USDC on Arbitrum plus 100 USDG on Robinhood is never 200 spendable units on either chain.`,
    };
  }
  if (/help|start|journey|demo/.test(q)) {
    return {
      role: "agent",
      text: "Start with Connect on Stellar Testnet — we create and Friendbot a session wallet. Then: 1) faucet USDC, 2) deposit into escrow, 3) publish a funded quote, 4) execute the job, 5) open the receipt. I will narrate each state. I never sign. Your wallet remains the authority.",
    };
  }
  return {
    role: "agent",
    text: `I can see ${snap.network || "Stellar Testnet"} and ${snap.wallet ? "a connected maker" : "no wallet yet"}. Ask me about funding, quotes, keeper execution, or why Nectar exists. I explain observed state — I do not move cash.`,
  };
}
