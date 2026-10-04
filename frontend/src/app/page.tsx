import Link from "next/link";

export default function LandingPage() {
  return (
    <main>
      <section className="relative min-h-[100svh] overflow-hidden hero-photo">
        <div className="absolute inset-0 ambient-grid opacity-60" />
        <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <div className="brand text-2xl tracking-tight text-[var(--honey)]">Nectar</div>
          <nav className="hidden gap-6 text-sm text-[var(--mist)] md:flex">
            <a href="#product">Product</a>
            <a href="#trust">Traction</a>
            <Link href="/app">Open app</Link>
          </nav>
          <div className="pill">Stellar testnet live</div>
        </header>

        <div className="relative z-10 mx-auto flex min-h-[calc(100svh-88px)] w-full max-w-6xl flex-col justify-end px-6 pb-16 pt-20 md:justify-center md:pb-24">
          <p className="brand animate-rise text-5xl leading-[0.95] text-[var(--honey)] md:text-7xl lg:text-8xl">
            Nectar
          </p>
          <h1 className="animate-rise-delay mt-5 max-w-2xl text-3xl font-medium leading-tight text-[var(--cream)] md:text-5xl">
            Liquidation liquidity that actually settles.
          </h1>
          <p className="animate-rise-delay-2 mt-5 max-w-xl text-base leading-relaxed text-[var(--mist)] md:text-lg">
            Funded bids. Reserved cash. Atomic debt repayment and collateral delivery for lending
            operators who need executable routes—not hope.
          </p>
          <div className="animate-rise-delay-2 mt-8 flex flex-wrap gap-3">
            <Link href="/app" className="btn-primary">
              Launch workspace
            </Link>
            <a href="#product" className="btn-ghost">
              See the flow
            </a>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[var(--ink)] to-transparent" />
      </section>

      <section id="product" className="mx-auto max-w-6xl px-6 py-24">
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--honey)]">One product path</p>
        <h2 className="mt-3 max-w-3xl text-4xl leading-tight text-[var(--cream)] md:text-5xl">
          From funded quote to finalized receipt in one workspace.
        </h2>
        <p className="mt-4 max-w-2xl text-[var(--mist)]">
          Makers deposit debt tokens, publish time-bounded quotes, and keepers settle eligible
          liquidations through Nectar&apos;s executor—cash, collateral, and fees reconciled onchain.
        </p>
        <div className="mt-12 grid gap-10 md:grid-cols-3">
          {[
            {
              title: "Reserve",
              copy: "Cash-backed quotes lock maker funds with firm expiry. No phantom capacity.",
            },
            {
              title: "Route",
              copy: "Compare maker liquidity against the exact position and refuse unsafe jobs.",
            },
            {
              title: "Settle",
              copy: "Atomic repayment, collateral delivery, keeper compensation, and protocol fee.",
            },
          ].map((item, i) => (
            <div key={item.title} className="border-t border-[var(--line)] pt-5">
              <div className="text-sm text-[var(--honey)]">0{i + 1}</div>
              <h3 className="mt-2 text-2xl text-[var(--cream)]">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--mist)]">{item.copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="trust" className="panel">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-[var(--honey)]">Built to scale</p>
            <h2 className="mt-3 text-4xl text-[var(--cream)] md:text-5xl">
              Proven on Stellar. Expanding the settlement network.
            </h2>
            <p className="mt-4 max-w-xl text-[var(--mist)]">
              Nectar already carries USP and a prior Stellar grant around $75,000. The protocol is
              under security audit, with testnet volume of $148k+ and growing. We will grow this
              product into the default liquidation liquidity layer.
            </p>
          </div>
          <div className="space-y-6 self-center">
            <div className="border-l border-[var(--line)] pl-4">
              <div className="text-3xl text-[var(--honey)]">$75k</div>
              <div className="text-sm text-[var(--mist)]">Prior Stellar grant support</div>
            </div>
            <div className="border-l border-[var(--line)] pl-4">
              <div className="text-3xl text-[var(--honey)]">$148k+</div>
              <div className="text-sm text-[var(--mist)]">Testnet volume and climbing</div>
            </div>
            <div className="border-l border-[var(--line)] pl-4">
              <div className="text-3xl text-[var(--honey)]">Audit</div>
              <div className="text-sm text-[var(--mist)]">Security review in progress</div>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-[var(--mist)] md:flex-row md:items-center md:justify-between">
        <div className="brand text-xl text-[var(--honey)]">Nectar</div>
        <div>Stellar / Soroban testnet prototype · Unified PRD v1.0</div>
        <Link href="/app" className="text-[var(--honey)]">
          Enter the app →
        </Link>
      </footer>
    </main>
  );
}
