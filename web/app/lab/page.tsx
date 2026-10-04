export default function LabPage() {
  return (
    <>
      <h1>Testnet Lab</h1>
      <p className="lede">Local Anvil stands in for a testnet session. It is not Arbitrum Sepolia and it is not Robinhood Chain.</p>
      <section className="panel">
        <h2>Commands</h2>
        <p className="mono">pnpm local:bootstrap</p>
        <p className="mono">pnpm scenario:run --network local --scenario funded-quote</p>
        <p className="mono">pnpm scenario:run --network local --scenario propamm</p>
        <p className="hint">The funded quote repays 10000, pays keeper 50, protocol fee 20, and surplus 70. The PropAMM route sells seized collateral inside the Morpho callback without a flash loan.</p>
      </section>
      <section className="panel">
        <h2>Sandbox label</h2>
        <p>The lending contract is Nectar Sandbox Morpho. It pins the upstream liquidation callback order and is not an official Morpho deployment.</p>
      </section>
    </>
  );
}
