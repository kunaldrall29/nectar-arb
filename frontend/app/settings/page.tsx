"use client";

import { ADMIN_PUBLIC, CONTRACTS, explorerAccount, explorerContract } from "@/lib/config";
import { clearWallet, loadWallet } from "@/lib/wallet";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [wallet, setWallet] = useState<string | null>(null);
  useEffect(() => setWallet(loadWallet()?.publicKey || null), []);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl text-nectar-honey">Settings</h1>
      <div className="panel rounded-2xl p-5 text-sm">
        <div className="font-display text-xl">Wallet</div>
        <p className="mt-2 text-nectar-mist">
          Session wallets are generated in the browser and funded by Friendbot. Freighter can be used later; this
          prototype does not require an extension.
        </p>
        <div className="mt-3">{wallet || "No session wallet"}</div>
        <button
          className="mt-3 rounded-full border border-nectar-line px-4 py-2"
          onClick={() => {
            clearWallet();
            setWallet(null);
          }}
        >
          Disconnect
        </button>
      </div>
      <div className="panel rounded-2xl p-5 text-sm space-y-2">
        <div className="font-display text-xl">Supported network</div>
        <div>Stellar Testnet · passphrase Test SDF Network ; September 2015</div>
        <a className="block text-nectar-gold" href={explorerAccount(ADMIN_PUBLIC)}>
          Deploy admin {ADMIN_PUBLIC}
        </a>
        {Object.entries(CONTRACTS).map(([k, v]) => (
          <a key={k} className="block text-nectar-gold" href={explorerContract(v)}>
            {k}: {v}
          </a>
        ))}
      </div>
    </div>
  );
}
