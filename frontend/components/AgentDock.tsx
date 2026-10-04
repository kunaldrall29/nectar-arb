"use client";

import { useState } from "react";
import { api, loadWallet } from "@/lib/wallet";

type Msg = { role: string; text: string };

export function AgentDock() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "agent",
      text: "I'm the Nectar agent. I read live Stellar testnet state and explain markets, quotes, and receipts. I never sign or spend.",
    },
  ]);
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMsgs((m) => [...m, { role: "you", text }]);
    setBusy(true);
    try {
      const data = await api("/agent/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, wallet: loadWallet()?.publicKey }),
      });
      setMsgs((m) => [...m, data.reply]);
    } catch (error) {
      setMsgs((m) => [
        ...m,
        { role: "agent", text: error instanceof Error ? error.message : "The agent could not reach the chain." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-40 rounded-full bg-nectar-gold px-4 py-3 text-sm font-medium text-[#2a1608] shadow-lg"
      >
        {open ? "Close agent" : "Ask Nectar"}
      </button>
      {open && (
        <aside className="panel fixed bottom-20 right-5 z-40 flex h-[460px] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl">
          <div className="border-b border-nectar-line px-4 py-3">
            <div className="font-display text-lg">Nectar agent</div>
            <div className="text-xs text-nectar-mist">Explains. Never authorizes.</div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`rounded-xl px-3 py-2 ${
                  m.role === "you" ? "ml-8 bg-nectar-gold/15" : "mr-4 bg-black/30 text-nectar-honey"
                }`}
              >
                {m.text}
              </div>
            ))}
            {busy && <div className="text-xs text-nectar-mist">Reading chain…</div>}
          </div>
          <form
            className="flex gap-2 border-t border-nectar-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about quotes, funding, or the live fill"
              className="flex-1 rounded-full border border-nectar-line bg-transparent px-3 py-2 text-sm outline-none"
            />
            <button className="rounded-full bg-nectar-gold px-3 text-xs text-[#2a1608]">Send</button>
          </form>
        </aside>
      )}
    </>
  );
}
