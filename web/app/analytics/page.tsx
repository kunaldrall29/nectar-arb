"use client";

import { ChainNotice, Money, useLiveData } from "@/components/Bits";

export default function AnalyticsPage() {
  const { hidden, ws, meta } = useLiveData();
  const market = ws?.market;
  const receipts = ws?.receipts ?? [];
  const decimals = market?.debtDecimals ?? 6;
  const symbol = market?.debtSymbol ?? "nUSD";
  const sum = (pick: (receipt: (typeof receipts)[number]) => string) =>
    receipts.reduce((total, receipt) => total + BigInt(pick(receipt) || "0"), 0n).toString();
  return (
    <>
      <h1>Analytics</h1>
      <p className="lede">
        Measured figures come from included settlement events on this deployment. Estimates are labeled separately and are not revenue.
        Testnet activity is not production volume.
      </p>
      <ChainNotice />
      {hidden || !market || !meta ? null : (
        <div className="grid two">
          <section className="panel">
            <h2>Measured on this deployment</h2>
            <div className="row"><span>Settlements</span><span>{receipts.length}</span></div>
            <div className="row"><span>Recovered debt</span><Money amount={sum((receipt) => receipt.debtRepaid)} decimals={decimals} symbol={symbol} /></div>
            <div className="row"><span>Protocol fees</span><Money amount={sum((receipt) => receipt.protocolFee)} decimals={decimals} symbol={symbol} /></div>
            <div className="row"><span>Keeper fees</span><Money amount={sum((receipt) => receipt.keeperCompensation)} decimals={decimals} symbol={symbol} /></div>
            <div className="row"><span>Collateral delivered</span><Money amount={sum((receipt) => receipt.collateralDelivered)} decimals={market.collateralDecimals} symbol={market.collateralSymbol} /></div>
            <div className="row"><span>Writeoff</span><Money amount={sum((receipt) => receipt.writeoff)} decimals={decimals} symbol={symbol} /></div>
            <p className="hint">
              Observed at block {meta.blockNumber}, {meta.observedAt}. These fills are self-operated by the prototype deployer and the local rehearsal signer. They are not independent customer volume.
            </p>
          </section>
          <section className="panel">
            <h2>Estimate, not a measurement</h2>
            <div className="row"><span>Unserved liquidatable debt</span><Money amount={market.unservedDebt} decimals={decimals} symbol={symbol} /></div>
            <div className="row"><span>Debt covered by an active quote</span><Money amount={market.executableDebt} decimals={decimals} symbol={symbol} /></div>
            <p className="hint">
              Executable debt assumes the active quote still passes preview at the next block. It expires, and it is not a standing bid for the whole market.
              No dollar production volume is shown because this deployment has not measured one.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
