import type { ChainState } from "./reader";

/**
 * Measured outcomes only (PRD Section 18 / AC03 / AC04): recovered debt is actual cash applied,
 * writeoffs are separate, revenue is completed fee transfers. Team-operated participants are flagged.
 */
export function computeAnalytics(s: ChainState, teamAddresses: string[] = []) {
  const team = new Set(teamAddresses.map((a) => a.toLowerCase()));
  const sum = (xs: string[]) => xs.reduce((a, x) => a + BigInt(x), 0n);
  const r = s.receipts;
  const filled = s.quotes.filter((q) => q.state === "Filled").length;
  const released = s.quotes.filter((q) => q.state === "Released").length;
  const expired = s.quotes.filter((q) => q.state === "Expired").length;
  const active = s.quotes.filter((q) => q.state === "Active").length;
  const byDay = new Map<string, bigint>();
  for (const x of r) {
    const day = x.timestamp ? new Date(x.timestamp * 1000).toISOString().slice(0, 10) : "unknown";
    byDay.set(day, (byDay.get(day) ?? 0n) + BigInt(x.debtRepaid));
  }
  const makers = new Set(r.map((x) => x.maker.toLowerCase()));
  const keepers = new Set(r.map((x) => x.keeper.toLowerCase()));
  return {
    chainId: s.chainId,
    sourceBlock: s.sourceBlock,
    label: "Measured testnet outcomes (not production revenue or organic usage)",
    measured: {
      settlements: r.length,
      recoveredDebt: sum(r.map((x) => x.debtRepaid)).toString(),
      collateralDelivered: sum(r.map((x) => x.collateralDelivered)).toString(),
      makerCashPaid: sum(r.map((x) => x.cashOut)).toString(),
      keeperCompensation: sum(r.map((x) => x.keeperFee)).toString(),
      protocolRevenue: sum(r.map((x) => x.protocolFee)).toString(),
      surplusReturned: sum(r.map((x) => x.surplus)).toString(),
      protocolWriteoff: sum(r.map((x) => x.writeoff)).toString(),
      quoteFillRate: filled + released + expired > 0 ? `${filled}/${filled + released + expired}` : "n/a",
      quotes: { active, filled, expired, released, total: s.quotes.length },
      uniqueMakers: makers.size,
      uniqueKeepers: keepers.size,
      teamOperatedMakers: [...makers].filter((m) => team.has(m)).length,
      teamOperatedKeepers: [...keepers].filter((k) => team.has(k)).length,
    },
    capacity: {
      fundedCash: s.vault.fundedCash,
      reservedCash: s.vault.reservedCash,
      liquidatableDebt: s.markets.reduce((a, m) => a + BigInt(m.liquidatableDebt), 0n).toString(),
      executableDebtNow: s.markets.reduce((a, m) => a + BigInt(m.executableDebt), 0n).toString(),
      unservedExposure: s.markets.reduce((a, m) => a + BigInt(m.unservedDebt), 0n).toString(),
    },
    recoveredByDay: [...byDay.entries()].map(([day, v]) => ({ day, recoveredDebt: v.toString() })).sort((a, b) => a.day.localeCompare(b.day)),
  };
}

export function receiptsToCsv(s: ChainState) {
  const head = [
    "chainId", "transactionHash", "blockNumber", "blockHash", "timestamp", "finality", "jobId", "quoteId", "marketKey",
    "borrower", "maker", "keeper", "debtRepaid", "collateralDelivered", "cashOut", "keeperFee", "protocolFee", "surplus",
    "writeoff", "policyVersion", "debtDecimals", "collateralDecimals",
  ];
  const rows = s.receipts.map((r) => {
    const m = s.markets.find((x) => x.marketKey === r.marketKey);
    return [
      s.chainId, r.transactionHash, r.blockNumber, r.blockHash, r.timestamp ?? "", r.finality, r.jobId, r.quoteId, r.marketKey,
      r.borrower, r.maker, r.keeper, r.debtRepaid, r.collateralDelivered, r.cashOut, r.keeperFee, r.protocolFee, r.surplus,
      r.writeoff, r.policyVersion, m?.loanToken.decimals ?? "", m?.collateralToken.decimals ?? "",
    ].join(",");
  });
  return [head.join(","), ...rows].join("\n");
}
