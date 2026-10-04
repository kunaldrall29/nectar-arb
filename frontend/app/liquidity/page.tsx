"use client";

import { useEffect, useState } from "react";
import { LIVE } from "@/lib/config";
import { usd } from "@/lib/format";
import { api, createWallet, loadWallet } from "@/lib/wallet";

export default function LiquidityPage() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [liq, setLiq] = useState<any>(null);
  const [log, setLog] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function refresh(address: string) {
    try {
      setLiq(await api(`/accounts/${address}/liquidity`));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "read failed");
    }
  }

  useEffect(() => {
    const w = loadWallet();
    if (w) {
      setWallet(w.publicKey);
      setSecret(w.secret);
      refresh(w.publicKey);
    }
  }, []);

  async function ensureWallet() {
    const w = loadWallet() || (await createWallet());
    setWallet(w.publicKey);
    setSecret(w.secret);
    setBusy("Funding wallet via Friendbot");
    await api("/wallet/fund", { method: "POST", body: JSON.stringify({ address: w.publicKey }) });
    await refresh(w.publicKey);
    setBusy(null);
    return w;
  }

  async function run(label: string, fn: () => Promise<any>) {
    setBusy(label);
    setErr(null);
    try {
      const out = await fn();
      setLog(JSON.stringify(out, null, 2));
      if (wallet) await refresh(wallet);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-nectar-honey">Liquidity</h1>
        <p className="mt-2 max-w-2xl text-nectar-mist">
          Wallet funds, available maker cash, and reserved cash are shown separately. A maker with 1,000 deposited and
          600 reserved can withdraw at most 400.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card k="Wallet USDC" v={liq ? usd(liq.walletUsdc) : "—"} />
        <Card k="Available maker cash" v={liq ? usd(liq.availableCash) : "—"} />
        <Card k="Reserved" v={liq ? usd(liq.reservedCash) : "—"} />
      </div>

      <div className="panel space-y-3 rounded-2xl p-5">
        <div className="text-sm text-nectar-mist">
          Network: Stellar Testnet · Asset: USDC · Destination: Nectar escrow
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => run("Connecting", ensureWallet)} label="Connect / fund wallet" />
          <Btn
            onClick={() =>
              run("Faucet", async () => {
                const w = await ensureWallet();
                return api("/faucet", { method: "POST", body: JSON.stringify({ address: w.publicKey }) });
              })
            }
            label="Faucet 20,000 USDC"
          />
          <Btn
            onClick={() =>
              run("Deposit", async () => {
                const w = await ensureWallet();
                return api("/liquidity/deposit", {
                  method: "POST",
                  body: JSON.stringify({ secret: w.secret, amount: "101400000000" }),
                });
              })
            }
            label="Deposit 10,140 USDC"
          />
          <Btn
            onClick={() =>
              run("Publish quote", async () => {
                const w = await ensureWallet();
                return api("/quotes", {
                  method: "POST",
                  body: JSON.stringify({
                    secret: w.secret,
                    borrower: LIVE.borrower,
                    keeper: w.publicKey,
                  }),
                });
              })
            }
            label="Publish funded quote"
          />
        </div>
        {busy && <div className="text-sm text-nectar-wait">{busy}…</div>}
        {err && <div className="text-sm text-nectar-bad">{err}</div>}
        {wallet && <div className="text-xs text-nectar-mist">Session wallet {wallet}</div>}
      </div>

      {log && <pre className="panel overflow-auto rounded-2xl p-4 text-xs text-nectar-honey">{log}</pre>}
    </div>
  );
}

function Card({ k, v }: { k: string; v: string }) {
  return (
    <div className="panel rounded-2xl p-5">
      <div className="text-xs uppercase tracking-[0.16em] text-nectar-mist">{k}</div>
      <div className="mt-2 font-display text-3xl">{v}</div>
    </div>
  );
}

function Btn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="rounded-full bg-nectar-gold px-4 py-2 text-sm text-[#2a1608]">
      {label}
    </button>
  );
}
