"use client";

import { useState } from "react";
import { api, loadWallet } from "@/lib/wallet";

export default function AgentPage() {
  const [input, setInput] = useState("What is Nectar's USP?");
  const [thread, setThread] = useState<{ role: string; text: string }[]>([]);

  async function send() {
    const data = await api("/agent/chat", {
      method: "POST",
      body: JSON.stringify({ message: input, wallet: loadWallet()?.publicKey }),
    });
    setThread((t) => [...t, { role: "you", text: input }, data.reply]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-nectar-honey">Nectar agent</h1>
        <p className="mt-2 max-w-2xl text-nectar-mist">
          The agent explains observed markets, quotes, and receipts. It cannot determine contract authorization or
          liquidation eligibility. Those stay on-chain.
        </p>
      </div>
      <div className="panel space-y-3 rounded-2xl p-5">
        {thread.map((m, i) => (
          <div key={i} className={m.role === "you" ? "text-white" : "text-nectar-honey"}>
            <span className="text-xs uppercase tracking-[0.16em] text-nectar-mist">{m.role}</span>
            <p className="mt-1">{m.text}</p>
          </div>
        ))}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="min-h-24 w-full rounded-xl border border-nectar-line bg-transparent p-3 text-sm"
        />
        <button onClick={send} className="rounded-full bg-nectar-gold px-4 py-2 text-sm text-[#2a1608]">
          Ask
        </button>
      </div>
    </div>
  );
}
