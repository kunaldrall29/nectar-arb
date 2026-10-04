import Link from "next/link";

export default function LandingPage() {
  return (
    <main>
      <section className="nc-hero">
        <div className="nc-kicker">Liquidation liquidity · atomic settlement</div>
        <h1>The bid is funded before the liquidation starts.</h1>
        <p className="lead">
          Nectar reserves a time-bounded buyer onchain, then settles debt, collateral and fees in
          one local-chain transaction. Built for lending operators, collateral buyers and keepers
          on Arbitrum and Robinhood Chain.
        </p>
        <div className="nc-row">
          <Link className="nc-btn-gold" href="/overview">
            Open the workspace
          </Link>
          <Link className="nc-btn" href="/markets">
            View markets
          </Link>
        </div>
      </section>

      <section className="landing-section split">
        <div>
          <div className="nc-kicker">Problem</div>
          <h2>Liquidations fail or leak value when there is no committed buyer.</h2>
          <p className="nc-sub">
            A quote that is only a message is not capacity. Nectar treats an unsigned indication as
            nothing, a signature as authorization, and an included reservation as the only
            executable bid.
          </p>
        </div>
        <div className="nc-card">
          <h3>How it works</h3>
          <ol className="nc-sub">
            <li>Maker deposits the market debt token into segregated escrow.</li>
            <li>Maker signs an EIP-712 single-fill quote. Cash is reserved onchain.</li>
            <li>Keeper previews maker vs AMM-estimate routes against the same state.</li>
            <li>executeJob settles atomically or reverts. Receipts are reconstructed from events.</li>
          </ol>
        </div>
      </section>

      <section className="landing-section">
        <div className="nc-kicker">This slice</div>
        <div className="nc-grid cols-3">
          <div className="nc-card">
            <h3>Arbitrum Sepolia</h3>
            <p className="nc-sub">Chain 421614. Live demo deployment target. Mock Morpho Blue labeled as rehearsal.</p>
          </div>
          <div className="nc-card">
            <h3>Robinhood Chain Testnet</h3>
            <p className="nc-sub">Chain 46630. Same product vocabulary. Shown as monitored until a Nectar deployment exists. Funds never cross.</p>
          </div>
          <div className="nc-card">
            <h3>Honest inventory</h3>
            <p className="nc-sub">No Nectar token. No bridge. No insurance. Combined $ figures are timestamped estimates, never spendable.</p>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="nc-kicker">Company narrative · as of demo · not live UI metrics</div>
        <div className="nc-card">
          <p className="nc-sub">
            Prior Stellar / Soroban work received a grant of about $75,000. The EVM product is a new
            implementation and is currently under security review. Testnet rehearsal volume cited in
            founder materials is $148k+ and growing — that figure is company narrative, not an
            onchain metric rendered as production usage in this app.
          </p>
        </div>
      </section>
    </main>
  );
}
