"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { api, type Liquidity, type Market, type Overview, type Receipt } from "@/lib/api";

type Tab = "overview" | "markets" | "liquidity" | "executions";

function shortAddr(v: string) {
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

function formatRaw(raw: string, decimals = 7) {
  const n = BigInt(raw || "0");
  const base = BigInt(10) ** BigInt(decimals);
  const whole = n / base;
  const frac = (n % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export default function AppWorkspace() {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [liquidity, setLiquidity] = useState<Liquidity | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setError(null);
    const [o, m, r] = await Promise.all([api.overview(), api.markets(), api.receipts()]);
    setOverview(o.data);
    setMarkets(m.data);
    setReceipts(r.data);
    if (o.data.deployer) {
      const liq = await api.liquidity(o.data.deployer);
      setLiquidity(liq.data);
    }
  }

  useEffect(() => {
    startTransition(() => {
      refresh().catch((e) => setError(String(e.message || e)));
    });
  }, []);

  async function runQuoteAndExecute() {
    if (!markets[0]) return;
    const position = markets[0].openPositions.find((p) => p.liquidatable && p.open);
    if (!position) {
      setError("No liquidatable open position. Seed a new one on testnet.");
      return;
    }
    setBusy(true);
    setStatus("Registering funded quote on Soroban testnet…");
    setError(null);
    try {
      const quote = await api.createQuote({ positionId: position.positionId, ttlSeconds: 120 });
      setStatus(`Quote #${quote.data.quoteId} active. Executing keeper job…`);
      const job = await api.executeJob(quote.data.quoteId);
      setStatus(`Settled. Tx ${shortAddr(job.data.txHash)}`);
      await refresh();
      setTab("executions");
    } catch (e) {
      setError(String((e as Error).message || e));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "markets", label: "Markets" },
    { id: "liquidity", label: "Liquidity" },
    { id: "executions", label: "Executions" },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--line)] bg-[rgba(7,20,15,0.65)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="brand text-2xl text-[var(--honey)]">
              Nectar
            </Link>
            <nav className="hidden gap-1 md:flex">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    tab === t.id
                      ? "bg-[rgba(226,177,74,0.16)] text-[var(--honey)]"
                      : "text-[var(--mist)] hover:text-[var(--cream)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="pill">Testnet</span>
            <button className="btn-primary !px-4 !py-2 text-sm" disabled={busy} onClick={runQuoteAndExecute}>
              {busy ? "Settling…" : "Run live demo"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {(pending || !overview) && !error && (
          <p className="text-[var(--mist)]">Loading live testnet state…</p>
        )}
        {error && (
          <div className="mb-6 border border-[var(--danger)]/40 bg-[rgba(196,92,58,0.12)] px-4 py-3 text-sm text-[#f0b09a]">
            {error}
          </div>
        )}
        {status && (
          <div className="mb-6 border border-[var(--line)] bg-[rgba(226,177,74,0.08)] px-4 py-3 text-sm text-[var(--honey)]">
            {status}
          </div>
        )}

        {overview && tab === "overview" && (
          <section className="animate-rise space-y-10">
            <div>
              <h1 className="text-4xl text-[var(--cream)] md:text-5xl">Workspace</h1>
              <p className="mt-3 max-w-2xl text-[var(--mist)]">
                Cash, reserved commitments, and executable opportunities across the active Nectar
                deployment. Combined dollars are never treated as spendable.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {overview.cashByChain.map((row) => (
                <div key={row.chain} className="border-t border-[var(--line)] pt-4">
                  <div className="text-sm uppercase tracking-[0.16em] text-[var(--honey)]">
                    {row.asset} · {row.chain}
                  </div>
                  <div className="mt-3 text-3xl text-[var(--cream)]">{row.availableDisplay}</div>
                  <div className="mt-2 text-sm text-[var(--mist)]">
                    Cash {row.cashDisplay} · Reserved {row.reservedDisplay}
                  </div>
                </div>
              ))}
              <div className="border-t border-[var(--line)] pt-4">
                <div className="text-sm uppercase tracking-[0.16em] text-[var(--honey)]">
                  Opportunities
                </div>
                <div className="mt-3 text-3xl text-[var(--cream)]">
                  {overview.executableOpportunities}
                </div>
                <div className="mt-2 text-sm text-[var(--mist)]">
                  Status {overview.operationalStatus}
                </div>
              </div>
              <div className="border-t border-[var(--line)] pt-4">
                <div className="text-sm uppercase tracking-[0.16em] text-[var(--honey)]">Trust</div>
                <div className="mt-3 space-y-2 text-sm text-[var(--mist)]">
                  <div>Grant ${overview.traction.stellarGrantUsd.toLocaleString()}</div>
                  <div>Audit: {overview.traction.securityAudit}</div>
                  <div>Volume ${overview.traction.testnetVolumeUsd.toLocaleString()}+</div>
                </div>
              </div>
            </div>
            <div>
              <h2 className="text-2xl text-[var(--cream)]">Contracts</h2>
              <div className="mt-4 grid gap-3 text-sm text-[var(--mist)] md:grid-cols-2">
                {Object.entries(overview.contracts).map(([k, v]) => (
                  <div key={k} className="border-t border-[var(--line)] pt-3">
                    <div className="text-[var(--honey)]">{k}</div>
                    <div className="mt-1 break-all font-mono text-xs">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {tab === "markets" && (
          <section className="animate-rise space-y-8">
            <div>
              <h1 className="text-4xl text-[var(--cream)]">Markets</h1>
              <p className="mt-3 text-[var(--mist)]">
                Integrated Soroban market with liquidatable positions and maker-route capacity.
              </p>
            </div>
            {markets.map((m) => (
              <div key={m.marketKey} className="space-y-6 border-t border-[var(--line)] pt-6">
                <div>
                  <div className="text-[var(--honey)]">{m.protocol}</div>
                  <h2 className="mt-1 text-3xl text-[var(--cream)]">{m.marketKey}</h2>
                  <p className="mt-2 text-sm text-[var(--mist)]">
                    Chain {m.chainId} · Unserved exposure {formatRaw(m.unservedExposure)} nUSD
                  </p>
                </div>
                <div className="space-y-4">
                  {m.openPositions.length === 0 && (
                    <p className="text-[var(--mist)]">No open positions right now.</p>
                  )}
                  {m.openPositions.map((p) => (
                    <div
                      key={p.positionId}
                      className="grid gap-2 border-t border-[var(--line)] py-4 md:grid-cols-4"
                    >
                      <div>
                        <div className="text-xs uppercase tracking-[0.14em] text-[var(--honey)]">
                          Position
                        </div>
                        <div className="text-xl">#{p.positionId}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.14em] text-[var(--honey)]">
                          Debt
                        </div>
                        <div>{p.debtAmountDisplay} nUSD</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.14em] text-[var(--honey)]">
                          Collateral
                        </div>
                        <div>{p.collateralAmountDisplay} nAAPL</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.14em] text-[var(--honey)]">
                          Health
                        </div>
                        <div>
                          {(p.health_factor_bps / 100).toFixed(2)}%{" "}
                          {p.liquidatable ? (
                            <span className="text-[var(--danger)]">liquidatable</span>
                          ) : (
                            <span className="text-[var(--ok)]">healthy</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {tab === "liquidity" && liquidity && (
          <section className="animate-rise space-y-8">
            <div>
              <h1 className="text-4xl text-[var(--cream)]">Liquidity</h1>
              <p className="mt-3 text-[var(--mist)]">
                Maker cash account for {shortAddr(liquidity.wallet)}. Withdrawable funds exclude
                active reservations.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="border-t border-[var(--line)] pt-4">
                <div className="text-sm text-[var(--honey)]">Deposited</div>
                <div className="mt-2 text-3xl">{liquidity.cashDisplay}</div>
              </div>
              <div className="border-t border-[var(--line)] pt-4">
                <div className="text-sm text-[var(--honey)]">Reserved</div>
                <div className="mt-2 text-3xl">{liquidity.reservedDisplay}</div>
              </div>
              <div className="border-t border-[var(--line)] pt-4">
                <div className="text-sm text-[var(--honey)]">Withdrawable</div>
                <div className="mt-2 text-3xl">{liquidity.availableDisplay}</div>
              </div>
            </div>
            <div>
              <h2 className="text-2xl">Quotes</h2>
              <div className="mt-4 space-y-3">
                {liquidity.quotes.length === 0 && (
                  <p className="text-[var(--mist)]">No quotes registered for this maker yet.</p>
                )}
                {liquidity.quotes.map((q) => (
                  <div
                    key={String(q.quote_id)}
                    className="grid gap-2 border-t border-[var(--line)] py-4 text-sm md:grid-cols-4"
                  >
                    <div>Quote #{String(q.quote_id)}</div>
                    <div>Cash out {formatRaw(String(q.cash_out))}</div>
                    <div>Position #{String(q.position_id)}</div>
                    <div>
                      {q.consumed ? "Filled" : q.released ? "Released" : "Active / historical"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {tab === "executions" && (
          <section className="animate-rise space-y-8">
            <div>
              <h1 className="text-4xl text-[var(--cream)]">Executions</h1>
              <p className="mt-3 text-[var(--mist)]">
                Canonical settlement receipts. Amounts are base units from onchain events.
              </p>
            </div>
            <div className="space-y-4">
              {receipts.map((r) => (
                <article key={`${r.receiptId}-${r.txHash}`} className="border-t border-[var(--line)] pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-2xl text-[var(--cream)]">
                      Receipt · quote #{r.quoteId} · position #{r.positionId}
                    </h3>
                    <a
                      className="text-sm text-[var(--honey)]"
                      href={`https://stellar.expert/explorer/testnet/tx/${r.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View transaction →
                    </a>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-[var(--mist)] md:grid-cols-4">
                    <div>Debt repaid {formatRaw(r.debtRepaid)}</div>
                    <div>Collateral {formatRaw(r.collateralSeized)}</div>
                    <div>Protocol fee {formatRaw(r.protocolFee)}</div>
                    <div>Surplus {formatRaw(r.surplus)}</div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
