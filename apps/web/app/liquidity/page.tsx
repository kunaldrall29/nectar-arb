"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { erc20Abi, maxUint256 } from "viem";
import { quoteEscrowAbi, quoteDomain, QUOTE_TYPES, type NectarQuote } from "@nectar/sdk";
import { NetworkFilter } from "@/components/AppShell";
import { chainQuery, short, units, useApi } from "@/lib/useNectar";

type Confirm = {
  network: string;
  asset: string;
  amount: string;
  destination: string;
  expiry?: string;
  fee: string;
  action: () => Promise<void>;
};

export default function LiquidityPage() {
  const [filter, setFilter] = useState("all");
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: wallet } = useWalletClient();
  const publicClient = usePublicClient();
  const liq = useApi<{ accounts: Array<Record<string, string>> }>(
    address ? `/api/v1/accounts/${address}/liquidity${chainQuery(filter)}` : "/api/v1/health",
  );
  const nets = useApi<{ networks: Array<Record<string, unknown>> }>("/api/v1/networks");
  const quotes = useApi<{ quotes: Array<Record<string, string>> }>(`/api/v1/quotes${chainQuery(filter)}`);
  const [amount, setAmount] = useState("10140");
  const [lifetime, setLifetime] = useState("60");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const live = nets.data?.networks?.find((n) => n.chainId === 421614 || n.chainId === 31337 && n.addresses);
  const dep = useMemo(() => {
    const list = nets.data?.networks || [];
    return list.find((n) => n.addresses && (filter === "all" || String(n.chainId) === filter)) ||
      list.find((n) => n.addresses);
  }, [nets.data, filter]);

  const addrs = (dep?.addresses || {}) as Record<string, `0x${string}`>;
  const targetChain = Number(dep?.chainId || 421614);

  async function ensureChain() {
    if (chainId !== targetChain) {
      await switchChainAsync({ chainId: targetChain });
    }
  }

  function openConfirm(c: Confirm) {
    setConfirm(c);
  }

  async function runConfirmed() {
    if (!confirm) return;
    setBusy(true);
    setStatus("");
    try {
      await confirm.action();
      setStatus("Included. Refreshing onchain view.");
      setConfirm(null);
      liq.reload();
      quotes.reload();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "rejected");
    } finally {
      setBusy(false);
    }
  }

  async function deposit() {
    if (!wallet || !address || !publicClient) throw new Error("Connect a wallet first");
    await ensureChain();
    const raw = BigInt(Math.round(Number(amount) * 1e6));
    const { request: approveReq } = await publicClient.simulateContract({
      account: address,
      address: addrs.debtToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [addrs.escrow, maxUint256],
    });
    await wallet.writeContract(approveReq);
    const { request } = await publicClient.simulateContract({
      account: address,
      address: addrs.escrow,
      abi: quoteEscrowAbi,
      functionName: "deposit",
      args: [addrs.debtToken, raw, address],
    });
    const hash = await wallet.writeContract(request);
    setStatus(`Deposit submitted ${hash}`);
  }

  async function withdraw() {
    if (!wallet || !address || !publicClient) throw new Error("Connect a wallet first");
    await ensureChain();
    const raw = BigInt(Math.round(Number(amount) * 1e6));
    const { request } = await publicClient.simulateContract({
      account: address,
      address: addrs.escrow,
      abi: quoteEscrowAbi,
      functionName: "withdraw",
      args: [addrs.debtToken, raw, address],
    });
    const hash = await wallet.writeContract(request);
    setStatus(`Withdraw submitted ${hash}`);
  }

  async function publishQuote() {
    if (!wallet || !address || !publicClient) throw new Error("Connect a wallet first");
    await ensureChain();
    const { marketRegistryAbi, positionKey } = await import("@nectar/sdk");
    const markets = await fetch("/api/v1/markets").then((r) => r.json());
    const m = markets.markets.find((x: { chainId: number }) => x.chainId === targetChain);
    const marketKey = (m?.marketKey || (dep as { marketKey?: string })?.marketKey) as `0x${string}`;
    const borrower = (m?.borrower || address) as `0x${string}`;
    const nonce = (await publicClient.readContract({
      address: addrs.escrow,
      abi: quoteEscrowAbi,
      functionName: "makerNonces",
      args: [address],
    })) as bigint;
    const cashOut = BigInt(Math.round(Number(amount) * 1e6));
    const validUntil = BigInt(Math.floor(Date.now() / 1000) + Number(lifetime));
    const reservationId = (`0x${crypto.randomUUID().replace(/-/g, "")}`.padEnd(66, "0")).slice(0, 66) as `0x${string}`;
    const policyHash = (await publicClient.readContract({
      address: addrs.registry,
      abi: marketRegistryAbi,
      functionName: "policyHashOf",
      args: [marketKey],
    })) as `0x${string}`;
    const quote: NectarQuote = {
      schemaVersion: 1n,
      chainId: BigInt(targetChain),
      verifyingContract: addrs.escrow,
      maker: address,
      makerNonce: nonce,
      marketKey,
      adapterVersion: 1n,
      borrower,
      positionKey: positionKey(marketKey, borrower),
      collateralToken: addrs.collateralToken,
      collateralAmount: 20_000n * 10n ** 18n,
      debtToken: addrs.debtToken,
      cashOut,
      maxDebtRepay: 10_000n * 10n ** 6n,
      collateralRecipient: address,
      keeperCompensation: 50n * 10n ** 6n,
      protocolFee: 20n * 10n ** 6n,
      minNetSurplus: 70n * 10n ** 6n,
      keeperRecipient: address,
      surplusRecipient: address,
      validUntil,
      reservationId,
      policyHash,
      quoteNonce: BigInt(Date.now()),
    };
    const signature = await wallet.signTypedData({
      account: address,
      domain: quoteDomain(targetChain, addrs.escrow),
      types: QUOTE_TYPES,
      primaryType: "Quote",
      message: quote,
    });
    const { request } = await publicClient.simulateContract({
      account: address,
      address: addrs.escrow,
      abi: quoteEscrowAbi,
      functionName: "registerQuote",
      args: [quote, signature],
    });
    const hash = await wallet.writeContract(request);
    setStatus(`Quote reserved ${hash}`);
  }

  async function release(quoteId: `0x${string}`) {
    if (!wallet || !address || !publicClient) throw new Error("Connect a wallet first");
    await ensureChain();
    const { request } = await publicClient.simulateContract({
      account: address,
      address: addrs.escrow,
      abi: quoteEscrowAbi,
      functionName: "releaseExpired",
      args: [quoteId],
    });
    const hash = await wallet.writeContract(request);
    setStatus(`Release submitted ${hash}`);
  }

  const acc = (liq.data?.accounts || []).find((a) => Number(a.chainId) === targetChain) || liq.data?.accounts?.[0];

  return (
    <main className="nc-page">
      <div className="nc-kicker">Liquidity</div>
      <h1>Maker cash</h1>
      <p className="nc-sub">Wallet token, available escrow and reserved commitments are shown separately.</p>
      <NetworkFilter value={filter} onChange={setFilter} />
      {!isConnected ? <p className="warn">Connect a wallet or the rehearsal signer to move funds.</p> : null}
      {!addrs.escrow ? <p className="warn">No escrow on this network yet. Fund the deployer (see FUNDING.md) or run the Anvil rehearsal.</p> : null}

      <div className="nc-grid cols-3">
        <div className="nc-card">
          <h3>Wallet token</h3>
          <div className="nc-kpi">{acc ? units((acc as { walletToken?: string }).walletToken || "0") : "—"}</div>
          <p className="nc-sub">{acc?.symbol || "nmUSDC"} held in the connected wallet.</p>
        </div>
        <div className="nc-card">
          <h3>Available</h3>
          <div className="nc-kpi">{acc ? units(acc.available) : "—"}</div>
          <p className="nc-sub">Withdrawable now. Reservations are excluded.</p>
        </div>
        <div className="nc-card">
          <h3>Reserved</h3>
          <div className="nc-kpi">{acc ? units(acc.reserved) : "—"}</div>
          <p className="nc-sub">Locked until fill or expiry + release.</p>
        </div>
      </div>

      <div className="nc-grid cols-2" style={{ marginTop: 16 }}>
        <div className="nc-card">
          <h3>Add funds / withdraw / quote</h3>
          <label className="nc-label">Amount (debt token, human units)</label>
          <input className="nc-input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <label className="nc-label">Quote lifetime (seconds, max 120)</label>
          <input className="nc-input" value={lifetime} onChange={(e) => setLifetime(e.target.value)} />
          <div className="nc-row" style={{ marginTop: 12 }}>
            <button className="nc-btn-gold" disabled={!addrs.escrow} onClick={() => openConfirm({
              network: `chain ${targetChain}`,
              asset: acc?.symbol || "nmUSDC",
              amount,
              destination: addrs.escrow || "escrow",
              fee: "network gas (ETH)",
              action: deposit,
            })}>Add funds</button>
            <button className="nc-btn" disabled={!addrs.escrow} onClick={() => openConfirm({
              network: `chain ${targetChain}`,
              asset: acc?.symbol || "nmUSDC",
              amount,
              destination: address || "wallet",
              expiry: `${lifetime}s`,
              fee: "network gas (ETH)",
              action: publishQuote,
            })}>Publish quote</button>
            <button className="nc-btn-ghost" disabled={!addrs.escrow} onClick={() => openConfirm({
              network: `chain ${targetChain}`,
              asset: acc?.symbol || "nmUSDC",
              amount,
              destination: address || "wallet",
              fee: "network gas (ETH)",
              action: withdraw,
            })}>Withdraw available</button>
          </div>
          {status ? <p className="nc-sub" style={{ marginTop: 10 }}>{status}</p> : null}
        </div>
        <div className="nc-card">
          <h3>Commitments</h3>
          <table className="nc-table">
            <thead><tr><th>Quote</th><th>State</th><th>Cash</th><th></th></tr></thead>
            <tbody>
              {quotes.data?.quotes?.length ? quotes.data.quotes.map((q) => (
                <tr key={q.quoteId}>
                  <td>{short(q.quoteId)}</td>
                  <td>{q.state}</td>
                  <td>{units(q.cashOut)}</td>
                  <td>
                    {q.state === "expired" ? (
                      <button className="nc-btn-ghost" onClick={() => release(q.quoteId as `0x${string}`)}>Release</button>
                    ) : null}
                  </td>
                </tr>
              )) : <tr><td colSpan={4}>No reservations indexed.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {confirm ? (
        <div className="nc-modal-bg">
          <div className="nc-modal">
            <div className="nc-kicker">Review before signature</div>
            <h2>Confirm action</h2>
            <p className="nc-sub">Network {confirm.network}</p>
            <p className="nc-sub">Asset {confirm.asset} · Amount {confirm.amount}</p>
            <p className="nc-sub">Destination {confirm.destination}</p>
            {confirm.expiry ? <p className="nc-sub">Reservation expiry {confirm.expiry}</p> : null}
            <p className="nc-sub">Expected fee {confirm.fee}</p>
            <div className="nc-row" style={{ marginTop: 14 }}>
              <button className="nc-btn-gold" disabled={busy} onClick={runConfirmed}>Sign</button>
              <button className="nc-btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
