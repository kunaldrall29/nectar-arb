"use client";

import { ChainNotice, Confirm, Money, useAction, useLiveData } from "@/components/Bits";
import { shortAddr } from "@/lib/format";

const LABELS: Record<string, string> = {
  awaiting_signature: "Awaiting signature",
  submitted: "Submitted",
  included: "Included",
  reverted: "Reverted",
  rejected: "Rejected",
};

export default function ExecutionsPage() {
  const { hidden, ws, data } = useLiveData();
  const execute = useAction("execute");
  const market = ws?.market;
  const active = ws?.quotes.find((quote) => quote.status === "active");
  return (
    <>
      <h1>Executions</h1>
      <p className="lede">
        A broadcast is not a fill. Included means the local receipt succeeded. Reverted means the chain rejected the settlement and reserved cash stayed unless the quote itself expired.
      </p>
      <ChainNotice />
      {hidden || !market || !ws ? null : (
        <>
          <section className="panel">
            <h2>Run keeper job</h2>
            {active ? (
              <>
                <p className="hint">
                  Quote {active.reservationId} reserves <Money amount={active.cashOut} decimals={market.debtDecimals} symbol={market.debtSymbol} /> for borrower {shortAddr(active.borrower)}.
                </p>
                {execute.error && <p className="alert" role="alert">{execute.error}</p>}
                <button className="solid" onClick={() => void execute.review({ reservationId: active.reservationId })}>
                  Review liquidation
                </button>
              </>
            ) : (
              <div className="empty">
                <strong>No active funded quote</strong>
                Publish one from Liquidity. There is nothing for a keeper to submit.
              </div>
            )}
          </section>
          <section className="panel" style={{ marginTop: 12 }}>
            <h2>Jobs</h2>
            {(data?.jobs.length ?? 0) === 0 ? (
              <div className="empty"><strong>No jobs in this session</strong>Awaiting signature, submitted, included, and reverted appear here after you review an action.</div>
            ) : (
              <div className="scroll">
                <table>
                  <thead>
                    <tr><th>When</th><th>Kind</th><th>Status</th><th>Transaction</th><th>Reason</th></tr>
                  </thead>
                  <tbody>
                    {data?.jobs.map((job) => (
                      <tr key={job.id}>
                        <td>{job.updatedAt.slice(11, 19)} UTC</td>
                        <td>{job.kind}</td>
                        <td><span className={`pill ${job.status === "included" ? "ok" : job.status === "reverted" || job.status === "rejected" ? "bad" : "neutral"}`}>{LABELS[job.status] ?? job.status}</span></td>
                        <td className="num">{job.txHash ? shortAddr(job.txHash) : "—"}</td>
                        <td>{job.reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="panel" style={{ marginTop: 12 }}>
            <h2>Receipts</h2>
            <p className="hint">Measured from LiquidationSettled logs. Finality here is {ws.receipts[0]?.finality ?? "not yet observed"}, not Ethereum finality.</p>
            {ws.receipts.length === 0 ? (
              <div className="empty"><strong>No settlements</strong>An empty receipt list is not zero revenue and not a failed indexer if the chain read is live.</div>
            ) : (
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Block</th><th className="num">Debt repaid</th><th className="num">Collateral</th><th className="num">Keeper</th><th className="num">Protocol</th><th className="num">Surplus</th><th className="num">Writeoff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ws.receipts.map((receipt) => (
                      <tr key={`${receipt.txHash}-${receipt.reservationId}`}>
                        <td>{receipt.blockNumber}</td>
                        <td className="num"><Money amount={receipt.debtRepaid} decimals={market.debtDecimals} symbol={market.debtSymbol} /></td>
                        <td className="num"><Money amount={receipt.collateralDelivered} decimals={market.collateralDecimals} symbol={market.collateralSymbol} /></td>
                        <td className="num"><Money amount={receipt.keeperCompensation} decimals={market.debtDecimals} symbol="" /></td>
                        <td className="num"><Money amount={receipt.protocolFee} decimals={market.debtDecimals} symbol="" /></td>
                        <td className="num"><Money amount={receipt.surplus} decimals={market.debtDecimals} symbol="" /></td>
                        <td className="num"><Money amount={receipt.writeoff} decimals={market.debtDecimals} symbol="" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {execute.plan && <Confirm plan={execute.plan} busy={execute.busy} onClose={execute.close} onSubmit={() => void execute.submit()} />}
        </>
      )}
    </>
  );
}
