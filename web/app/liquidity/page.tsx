"use client";

import { useState } from "react";
import { ChainNotice, Confirm, Money, useAction, useLiveData } from "@/components/Bits";
import { formatTime, formatUnitsRaw, shortAddr } from "@/lib/format";

export default function LiquidityPage() {
  const { hidden, ws, demoEnabled } = useLiveData();
  const market = ws?.market;
  const liquidity = ws?.liquidity;
  const deposit = useAction("deposit");
  const quote = useAction("quote");
  const withdraw = useAction("withdraw");
  const [amount, setAmount] = useState("20000");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [borrower, setBorrower] = useState("");
  const decimals = market?.debtDecimals ?? 6;
  const symbol = market?.debtSymbol ?? "nUSD";
  const openBorrower = market?.positions.find((position) => position.liquidatable)?.borrower ?? "";

  return (
    <>
      <h1>Liquidity</h1>
      <p className="lede">
        Wallet funds, available maker cash, and reserved cash are separate. Publishing a quote reserves the full cash amount on this chain.
      </p>
      <ChainNotice />
      {hidden || !market ? null : (
        <>
          {!demoEnabled && (
            <div className="banner">The local rehearsal signer is off. Reads still work. Deposits from this page need the Anvil demo API.</div>
          )}
          <div className="grid stats">
            <section className="panel">
              <div className="kicker">Wallet {symbol}</div>
              <div className="figure">{liquidity ? <Money amount={liquidity.walletDebt} decimals={decimals} symbol={symbol} /> : "—"}</div>
              <p className="hint">Token balance in the signer wallet. Not yet in escrow.</p>
            </section>
            <section className="panel">
              <div className="kicker">Available maker cash</div>
              <div className="figure">{liquidity ? <Money amount={liquidity.available} decimals={decimals} symbol={symbol} /> : "—"}</div>
              <p className="hint">Deposited minus reserved. This is the withdrawable amount.</p>
            </section>
            <section className="panel">
              <div className="kicker">Reserved</div>
              <div className="figure">{liquidity ? <Money amount={liquidity.reserved} decimals={decimals} symbol={symbol} /> : "—"}</div>
              <p className="hint">Cannot be withdrawn while a quote is active. Expiry needs a release transaction.</p>
            </section>
          </div>
          <div className="grid two" style={{ marginTop: 12 }}>
            <section className="panel">
              <h2>Add funds</h2>
              <form className="stack" onSubmit={(event) => { event.preventDefault(); void deposit.review({ amount }); }}>
                <label>
                  Amount ({symbol})
                  <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" aria-describedby="deposit-help" />
                </label>
                <p id="deposit-help" className="hint">Credits the rehearsal signer on the connected chain. Default 20,000 covers one 10,140 quote and leaves cash free.</p>
                {deposit.error && <p className="alert" role="alert">{deposit.error}</p>}
                <div className="actions"><button className="solid" type="submit">Review deposit</button></div>
              </form>
            </section>
            <section className="panel">
              <h2>Publish quote</h2>
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  void quote.review({ borrower: borrower || openBorrower });
                }}
              >
                <label>
                  Borrower
                  <select value={borrower || openBorrower} onChange={(event) => setBorrower(event.target.value)}>
                    <option value="">Select a position</option>
                    {market.positions.filter((position) => position.debt !== "0").map((position) => (
                      <option key={position.borrower} value={position.borrower}>
                        {shortAddr(position.borrower)} · {position.liquidatable ? "liquidatable" : "not eligible"}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="hint">Single fill. Cash out is debt plus 140 {symbol} for keeper 50, protocol 20, and minimum surplus 70. Lifetime is at most 120 seconds.</p>
                {quote.error && <p className="alert" role="alert">{quote.error}</p>}
                <div className="actions"><button className="solid" type="submit" disabled={!openBorrower && !borrower}>Review quote</button></div>
              </form>
            </section>
          </div>
          <section className="panel" style={{ marginTop: 12 }}>
            <h2>Withdraw available</h2>
            <form className="stack" onSubmit={(event) => { event.preventDefault(); void withdraw.review({ amount: withdrawAmount }); }}>
              <label>
                Amount ({symbol})
                <input value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} inputMode="decimal" />
              </label>
              {withdraw.error && <p className="alert" role="alert">{withdraw.error}</p>}
              <div className="actions">
                <button className="ghost" type="button" onClick={() => liquidity && setWithdrawAmount(formatUnitsRaw(liquidity.available, decimals))}>
                  Use full available
                </button>
                <button className="solid" type="submit">Review withdrawal</button>
              </div>
            </form>
            <p className="hint">The full-available control formats from the integer balance. Do not withdraw reserved cash; the contract will revert.</p>
          </section>
          <section className="panel" style={{ marginTop: 12 }}>
            <h2>Commitments</h2>
            {ws?.quotes.filter((item) => !liquidity || item.maker.toLowerCase() === liquidity.wallet.toLowerCase()).length === 0 ? (
              <div className="empty"><strong>No commitments for this maker</strong>A signature that is not registered onchain is not funded capacity.</div>
            ) : (
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Id</th><th>Status</th><th className="num">Reserved cash</th><th>Expiry</th><th>Borrower</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ws?.quotes.filter((item) => !liquidity || item.maker.toLowerCase() === liquidity.wallet.toLowerCase()).map((item) => (
                      <tr key={item.reservationId}>
                        <td>{item.reservationId}</td>
                        <td>{item.status}</td>
                        <td className="num"><Money amount={item.cashOut} decimals={decimals} symbol={symbol} /></td>
                        <td>{formatTime(item.validUntil)}</td>
                        <td className="num">{shortAddr(item.borrower)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {deposit.plan && <Confirm plan={deposit.plan} busy={deposit.busy} onClose={deposit.close} onSubmit={() => void deposit.submit()} />}
          {quote.plan && <Confirm plan={quote.plan} busy={quote.busy} onClose={quote.close} onSubmit={() => void quote.submit()} />}
          {withdraw.plan && <Confirm plan={withdraw.plan} busy={withdraw.busy} onClose={withdraw.close} onSubmit={() => void withdraw.submit()} />}
          {(deposit.job || quote.job || withdraw.job) && (
            <p className="oknote" role="status">
              Latest job {(deposit.job ?? quote.job ?? withdraw.job)?.kind} is {(deposit.job ?? quote.job ?? withdraw.job)?.status}.
              {((deposit.job ?? quote.job ?? withdraw.job)?.txHash) && ` Tx ${shortAddr((deposit.job ?? quote.job ?? withdraw.job)?.txHash)}`}
            </p>
          )}
        </>
      )}
    </>
  );
}
