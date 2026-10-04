"use client";

import { API_URL } from "@/lib/config";

export default function ExecutionsPage() {
  return (
    <div>
      <h1>Executions</h1>
      <p className="muted">Jobs and receipts with explicit finality labels. Wallet rejection ≠ failed liquidation.</p>
      <div className="card">
        <h2>Demo keeper path</h2>
        <p className="muted">
          Run <code>npm run demo:keeper -w @nectar/api</code> against local Anvil to simulate a funded quote fill and POST receipt to {API_URL}/v1/jobs.
        </p>
      </div>
    </div>
  );
}
