import Link from "next/link";
import { DemoRunner } from "@/components/DemoRunner";

export default function HomePage() {
  return (
    <div>
      <section className="relative min-h-[88vh] overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(120deg, rgba(7,20,15,0.55), rgba(7,20,15,0.82)), url('https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=2400&q=80')",
            backgroundSize: "cover",
            backgroundPosition: "center"
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(240,193,74,0.22),transparent_40%)]" />
        <div className="relative mx-auto flex min-h-[88vh] max-w-6xl flex-col justify-end px-5 pb-16 pt-24 md:px-8 md:pb-24">
          <p className="animate-rise display text-5xl leading-[0.95] text-[var(--honey)] md:text-7xl lg:text-8xl">
            Nectar
          </p>
          <h1 className="animate-rise-delay mt-5 max-w-2xl text-2xl font-medium leading-snug text-[var(--mist)] md:text-3xl">
            Funded liquidation bids that settle when lending markets need them.
          </h1>
          <p className="animate-rise-delay-2 mt-4 max-w-xl text-base text-[var(--fog)] md:text-lg">
            Makers reserve cash. Keepers execute. Debt, collateral, and fees clear in one atomic
            transaction — on Arbitrum today, Robinhood Chain next.
          </p>
          <div className="animate-rise-delay-2 mt-8 flex flex-wrap gap-3">
            <Link href="/liquidity" className="btn-primary">
              Open liquidity desk
            </Link>
            <Link href="/markets" className="btn-ghost">
              View markets
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8">
        <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h2 className="display text-3xl text-[var(--honey)] md:text-4xl">One workspace. Exact settlement.</h2>
            <p className="mt-3 max-w-xl text-[var(--fog)]">
              Nectar finds executable routes for eligible liquidations, reserves buyer funds, and
              settles debt plus collateral atomically — with receipts you can reconcile.
            </p>
          </div>
          <DemoRunner />
        </div>
      </section>
    </div>
  );
}
