"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { API_BASE } from "@/wagmi";

export default function MarketsPage() {
  const [markets, setMarkets] = useState<unknown>(null);
  useEffect(() => {
    fetch(`${API_BASE}/v1/markets`).then((r) => r.json()).then(setMarkets);
  }, []);
  return (
    <Shell>
      <h2 className="text-2xl font-semibold mb-4">Markets</h2>
      <p className="text-sm text-slate-400 mb-4">Monitored vs integrated markets; mock lending labeled per PX05.</p>
      <pre className="text-xs overflow-auto bg-nectar-panel border border-white/10 p-4 rounded-xl">{JSON.stringify(markets, null, 2)}</pre>
    </Shell>
  );
}
