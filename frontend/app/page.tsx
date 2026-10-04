"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { explorerTx } from "@/lib/config";
import { usd } from "@/lib/format";
import { LIVE } from "@/lib/config";
import { api } from "@/lib/wallet";

export default function OverviewPage() {
  const [liq, setLiq] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api("/accounts/GD5HJ4XVSEM5GFEVVVZE6CLO2FDOQXZADJWOZ5Q2M2XR345I73GGZBLN/liquidity")
      .then(setLiq)
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-nectar-gold">Liquidation liquidity network</p>
          <h1 className="mt-3 font-display text-5xl leading-[1.05] text-nectar-honey md:text-6xl">
            Funded bids.
            <br />
            Atomic settlement.
          </h1>
          <p className="mt-5 max-w-xl text-nectar-mist">
            Nectar finds executable routes for eligible liquidations, reserves maker cash, and settles debt plus
            collateral in one local-chain transaction. Stellar testnet is live. Arbitrum and Robinhood Chain use the
            same product — never the same purse.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/liquidity" className="rounded-full bg-nectar-gold px-5 py-2 text-sm text-[#2a1608]">
              Add funds
            </Link>
            <Link href="/executions" className="rounded-full border border-nectar-line px-5 py-2 text-sm">
              View live receipt
            </Link>
          </div>
        </div>
        <div className="panel rounded-2xl p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-nectar-mist">Operational status</div>
          <div className="mt-3 text-nectar-honey">Stellar Testnet · healthy</div>
          <div className="mt-4 space-y-2 text-sm">
            <Row k="Protocol fee recipient" v="admin (testnet)" />
            <Row k="Keeper allowlist" v="Off — any keeper, same checks" />
            <Row k="Quote TTL" v="300s testnet policy" />
            <Row k="Last finalized fill" v={LIVE.quoteId.slice(0, 10) + "…"} />
          </div>
          {err && <p className="mt-4 text-sm text-nectar-bad">RPC unavailable: {err}</p>}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="Funded cash (admin escrow)" value={liq ? usd(liq.fundedCash) : "Reading…"} hint="On-chain, Stellar only" />
        <Stat label="Reserved now" value={liq ? usd(liq.reservedCash) : "Reading…"} hint="Unavailable until fill or release" />
        <Stat label="Live fixture recovered" value="$10,000" hint="Plus $50 / $20 / $70 allocation" />
      </section>

      <section className="panel rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Executable opportunity</h2>
          <span className="text-xs text-nectar-ok">Funded quote route</span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-nectar-mist">
          HOOD / USDC lab market. The first public rehearsal repaid 10,000 USDC, delivered 12,000 HOOD, and conserved
          10,140 exactly. Combined dollar estimates are not spendable balances.
        </p>
        <a className="mt-4 inline-block text-sm text-nectar-gold" href={explorerTx(LIVE.transactions.execute)}>
          Open settlement on Stellar Expert →
        </a>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="panel rounded-2xl p-5">
      <div className="text-xs uppercase tracking-[0.16em] text-nectar-mist">{label}</div>
      <div className="mt-2 font-display text-3xl text-nectar-honey">{value}</div>
      <div className="mt-1 text-xs text-nectar-mist">{hint}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 text-nectar-mist">
      <span>{k}</span>
      <span className="text-nectar-honey">{v}</span>
    </div>
  );
}
