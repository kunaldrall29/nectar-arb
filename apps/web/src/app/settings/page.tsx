import manifest from "../../../../../deployments/manifest.json";

export default function SettingsPage() {
  return (
    <div>
      <h1>Settings</h1>
      <p className="muted">Wallet, API keys, and supported networks. RPC is preconfigured for the rehearsal.</p>
      <div className="card">
        <h2>Deployment manifest</h2>
        <pre style={{ overflow: "auto", fontSize: 0.75 }}>{JSON.stringify(manifest, null, 2)}</pre>
      </div>
    </div>
  );
}
