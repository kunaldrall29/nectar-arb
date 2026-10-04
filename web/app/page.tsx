import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <h1>Funded liquidity for liquidations</h1>
      <p className="lede">
        Nectar is one product on two chains. A maker funds a quote or a private inventory pool. A keeper settles an
        eligible loan in one transaction and pays their own failed gas. Borrowers stay under the lending protocol's rules.
      </p>
      <div className="grid two">
        <section className="panel">
          <h2>What this build is</h2>
          <p>A local and testnet protocol: registry, quote escrow, executor, sandbox Morpho adapter, and maker-owned PropAMM.</p>
          <p className="hint">There is no native token, no public pooled-yield vault, and no cross-chain balance.</p>
          <p>
            <Link className="primary" href="/overview">
              Open the overview
            </Link>
          </p>
        </section>
        <section className="panel">
          <h2>Not claimed</h2>
          <p>No EVM audit. The Robinhood Chain deployment in Settings is the earlier rehearsal bytecode, not this module set, unless a new manifest says otherwise.</p>
          <p className="hint">Arbitrum Sepolia is not deployed while the deployer balance is zero.</p>
        </section>
      </div>
    </>
  );
}
