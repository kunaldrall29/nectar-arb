"use client";

import { useEffect, useState } from "react";
import { api, createWallet, loadWallet } from "@/lib/wallet";
import { shortAddr } from "@/lib/format";

export function WalletButton() {
  const [addr, setAddr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setAddr(loadWallet()?.publicKey || null);
  }, []);

  async function connect() {
    setBusy(true);
    setErr(null);
    try {
      const existing = loadWallet() || (await createWallet());
      await api("/wallet/fund", {
        method: "POST",
        body: JSON.stringify({ address: existing.publicKey }),
      });
      setAddr(existing.publicKey);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  if (addr) {
    return (
      <div className="rounded-full border border-nectar-line bg-nectar-panel px-3 py-1.5 text-xs text-nectar-honey" title={addr}>
        {shortAddr(addr, 4)}
      </div>
    );
  }
  return (
    <button
      onClick={connect}
      disabled={busy}
      className="rounded-full bg-nectar-gold px-3 py-1.5 text-xs font-medium text-[#2a1608]"
    >
      {busy ? "Funding…" : "Connect testnet wallet"}
    </button>
  );
}
