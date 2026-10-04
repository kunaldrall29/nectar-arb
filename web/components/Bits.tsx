"use client";

import { useState } from "react";
import { postJson, type Job, type Plan } from "@/lib/api";
import { formatTime, formatUnits, shortAddr } from "@/lib/format";
import { useApp } from "./AppState";

export function Banner({ children }: { children: React.ReactNode }) {
  return <div className="banner">{children}</div>;
}

export function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty" role="status">
      <strong>{title}</strong>
      {body}
    </div>
  );
}

export function useLiveData() {
  const app = useApp();
  const hidden = app.filter === "robinhood-testnet";
  const standIn = app.filter !== "robinhood-testnet" && app.data?.meta.chainId === 31337;
  return { ...app, hidden, standIn, ws: app.data?.workspace ?? null, meta: app.data?.meta };
}

export function ChainNotice() {
  const { hidden, standIn, filter, meta } = useLiveData();
  if (hidden) {
    return (
      <Unavailable
        title="Robinhood Chain testnet is not this session"
        body="A rehearsal deployment exists on chain 46630. This workspace is not connected to it, so those balances are omitted. That is not a zero balance, a loading error, or capacity of zero. Cash on the connected chain cannot settle there. The market there is still the Nectar rehearsal fixture, not production stock collateral."
      />
    );
  }
  if (meta?.freshness === "unavailable") {
    return (
      <Unavailable
        title="Chain data is unavailable"
        body={meta.error ?? "The API could not read the connected RPC. Figures are withheld rather than shown as zero."}
      />
    );
  }
  if (standIn && filter === "arbitrum-sepolia") {
    return (
      <Banner>
        <strong>Local stand-in.</strong> The filter is Arbitrum Sepolia, but the connected RPC is Anvil chain 31337.
        Amounts below are rehearsal state, not Sepolia balances.
      </Banner>
    );
  }
  if (standIn) {
    return (
      <Banner>
        <strong>Hackathon prototype.</strong> One rehearsal market on local Anvil, shaped like the Arbitrum Sepolia slice.
        Not production. Not audited. Not Morpho.
      </Banner>
    );
  }
  return (
    <Banner>
      <strong>Arbitrum Sepolia testnet.</strong> The lending market is a Nectar rehearsal fixture, not production Morpho.
      Contracts are not audited.
    </Banner>
  );
}

export function Money({
  amount,
  decimals,
  symbol,
}: {
  amount: string | null | undefined;
  decimals: number;
  symbol: string;
}) {
  return (
    <span title={amount ? `${amount} base units` : "unread"}>
      {amount === null || amount === undefined ? "—" : `${formatUnits(amount, decimals)} ${symbol}`}
    </span>
  );
}

export function Confirm({
  plan,
  busy,
  onClose,
  onSubmit,
}: {
  plan: Plan;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const blocked = plan.preview && plan.preview.ok === false;
  return (
    <div className="sheet-back" role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h3 id="confirm-title">Review before signing</h3>
        <p className="hint">Nothing is submitted until you confirm. A dismissed review is not an onchain failure.</p>
        <div className="row"><span>Network</span><span>{plan.network.name} · {plan.network.chainId}</span></div>
        <div className="row"><span>Asset</span><span>{plan.asset} {plan.amount && plan.decimals !== undefined ? formatUnits(plan.amount, plan.decimals) : ""}</span></div>
        <div className="row"><span>Destination</span><span>{plan.destinationLabel}<br />{shortAddr(plan.destination)}</span></div>
        <div className="row"><span>Expiry</span><span>{plan.expiry ? formatTime(plan.expiry) : "None"}</span></div>
        <div className="row"><span>Fee</span><span>{plan.fee}</span></div>
        {plan.notes?.map((note) => <p key={note} className="hint">{note}</p>)}
        {plan.network.warning && <p className="hint">{plan.network.warning}</p>}
        {blocked && <p className="alert" role="alert">Execution preview refused: {plan.preview?.reason}. The transaction will not be sent.</p>}
        <div className="actions">
          <button className="solid" disabled={busy || blocked} onClick={onSubmit}>{busy ? "Submitting" : "Submit"}</button>
          <button className="ghost" onClick={onClose}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}

export function useAction(kind: "deposit" | "quote" | "execute" | "withdraw" | "release") {
  const { refresh } = useApp();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);

  async function review(next: Record<string, unknown>) {
    setError(null);
    setBusy(true);
    try {
      const body = await postJson<{ plan: Plan }>(`/nectar-api/v1/demo/${kind}`, { ...next, confirm: false });
      setPayload(next);
      setPlan(body.plan);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not prepare the transaction.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body = await postJson<{ job: Job }>(`/nectar-api/v1/demo/${kind}`, { ...payload, confirm: true });
      setJob(body.job);
      setPlan(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The transaction was rejected.");
    } finally {
      setBusy(false);
    }
  }

  return { plan, error, busy, job, review, submit, close: () => setPlan(null) };
}
