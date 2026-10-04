"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

type NetworksBody = {
  networks: Array<{ id: string; chainId: number; name: string; status: string; detail: string }>;
};

export default function SettingsPage() {
  const [networks, setNetworks] = useState<NetworksBody | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiGet<NetworksBody>("/v1/networks")
      .then((body) => setNetworks(body))
      .catch((err: Error) => setError(err.message));
  }, []);
  return (
    <>
      <h1>Settings</h1>
      <p className="lede">Wallet-less reads use the API. Signing from this app is limited to local Anvil, and only after the confirmation fields are checked.</p>
      {error ? <p className="reason">{error}</p> : null}
      {(networks?.networks ?? []).map((network) => (
        <section className="panel" key={network.id}>
          <h2>{network.name}</h2>
          <div className="row"><span>Chain id</span><span>{network.chainId}</span></div>
          <div className="row"><span>Status</span><span>{network.status}</span></div>
          <p className="hint">{network.detail}</p>
        </section>
      ))}
      <section className="panel">
        <h2>Official USDG, reads only</h2>
        <p>Robinhood testnet 0x7E955252E15c84f5768B83c41a71F9eba181802F. Arbitrum Sepolia 0xFFC95faa3d63Cde504a05B567C600B78C0b41892. Both are 6 decimals. The lab debt token is nUSD, not USDG.</p>
      </section>
      <section className="panel">
        <h2>Robinhood rehearsal, earlier bytecode</h2>
        <p className="mono">Escrow 0xa91112a940eaC477e114c6Ed90d35F108693999a</p>
        <p className="mono">Quotes 0xB5B19c8C80F11d5912d0ff16C5eE673bd0DFA332</p>
        <p className="mono">Executor 0x6F05CaD318337AFB72A94092Cd88f8485a48D6EC</p>
        <p className="hint">These addresses are the rehearsal deployment. They are not the new modules unless a later manifest records a verified redeploy.</p>
      </section>
    </>
  );
}
