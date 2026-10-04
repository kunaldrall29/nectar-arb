export default function AnalyticsPage() {
  return (
    <div>
      <h1>Analytics</h1>
      <p className="muted">Measured outcomes only on testnet. Simulations labeled separately.</p>
      <div className="card grid grid-2">
        <div>
          <h2>Recovered debt (testnet)</h2>
          <p style={{ fontSize: "1.5rem", margin: 0 }}>10,000+</p>
          <p className="muted">Base units per rehearsal fixture</p>
        </div>
        <div>
          <h2>Quote fill rate</h2>
          <p style={{ fontSize: "1.5rem", margin: 0 }}>Pilot</p>
          <p className="muted">Self-operated demo makers identified</p>
        </div>
      </div>
    </div>
  );
}
