"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { API_BASE } from "@/wagmi";

export default function ExecutionsPage() {
  const [receipts, setReceipts] = useState<unknown>(null);
  useEffect(() => {
    fetch(`${API_BASE}/v1/receipts`).then((r) => r.json()).then(setReceipts);
  }, []);
  return (
    <Shell>
      <h2 className="text-2xl font-semibold mb-4">Executions</h2>
      <p className="text-sm text-slate-400 mb-4">Canonical settlement receipts indexed from LiquidationSettled events.</p>
      <pre className="text-xs overflow-auto bg-nectar-panel border border-white/10 p-4 rounded-xl">{JSON.stringify(receipts, null, 2)}</pre>
    </Shell>
  );
}
