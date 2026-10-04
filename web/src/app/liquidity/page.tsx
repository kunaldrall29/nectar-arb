"use client";

import { useMemo, useState } from "react";
import {
  formatUnitsExact,
  makerVaultAbi,
  parseUnitsExact,
  quoteDomain,
  quoteToTypedMessage,
  quoteTypedDataTypes,
  suggestedQuoteFromPosition,
  testTokenAbi,
} from "@nectar/core";
import type { Hex } from "viem";
import { useAccount, useSwitchChain, useSignTypedData, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { zeroAddress } from "viem";
import { useNetwork } from "@/lib/network-context";
import { useChainState } from "@/lib/use-chain-state";

export default function LiquidityPage() {
  const { net } = useNetwork();
  const d = net.deployment;
  const { data: chain } = useChainState();
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [depositAmt, setDepositAmt] = useState("1000");
  const [withdrawAmt, setWithdrawAmt] = useState("100");
  const [selectedMarket, setSelectedMarket] = useState<string>("");
  const [selectedBorrower, setSelectedBorrower] = useState<string>("");

  const write = useWriteContract();
  const sign = useSignTypedData();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: write.data });

  const liquidity = useReadContract({
    address: d?.vault,
    abi: makerVaultAbi,
    functionName: "available",
    args: address && d ? [address, d.usdc] : undefined,
    query: { enabled: !!address && !!d },
  });

  const positions = useMemo(() => {
    if (!chain) return [];
    return chain.positions.filter((p) => p.status === "liquidatable" || p.status === "at-risk");
  }, [chain]);

  async function ensureChain() {
    if (!address) throw new Error("Connect wallet");
    if (chainId !== net.chain.id) await switchChainAsync({ chainId: net.chain.id });
  }

  async function faucet(token: `0x${string}`) {
    await ensureChain();
    write.writeContract({ address: token, abi: testTokenAbi, functionName: "faucet" });
  }

  async function deposit() {
    if (!d) return;
    await ensureChain();
    const amount = parseUnitsExact(depositAmt, 6);
    write.writeContract({ address: d.usdc, abi: testTokenAbi, functionName: "approve", args: [d.vault, amount] });
    // sequential: user may need second click after approve — for demo use max approval path
    write.writeContract({ address: d.vault, abi: makerVaultAbi, functionName: "deposit", args: [d.usdc, amount, address!] });
  }

  async function withdraw() {
    if (!d) return;
    await ensureChain();
    const amount = parseUnitsExact(withdrawAmt, 6);
    write.writeContract({ address: d.vault, abi: makerVaultAbi, functionName: "withdraw", args: [d.usdc, amount, address!] });
  }

  async function publishQuote() {
    if (!d || !chain || !address) return;
    await ensureChain();
    const market = chain.markets.find((m) => m.marketKey === selectedMarket) ?? chain.markets[0];
    const pos = positions.find((p) => p.borrower === selectedBorrower) ?? positions[0];
    if (!market || !pos) return alert("Pick a market and position");
    const validUntil = BigInt(Math.floor(Date.now() / 1000) + 600);
    const nonce = BigInt(Date.now());
    const q = suggestedQuoteFromPosition(
      d,
      market.marketKey as Hex,
      market.policy.version,
      address,
      market.collateralToken.address,
      market.loanToken.address,
      BigInt(pos.collateral),
      BigInt(pos.debt) + 500n * 10n ** 6n,
      validUntil,
      nonce,
      pos.borrower as `0x${string}`,
    );
    const message = quoteToTypedMessage(q);
    const domain = quoteDomain(d.chainId, d.vault);
    let signature: Hex = "0x";
    if (address.toLowerCase() !== q.maker.toLowerCase()) {
      const sig = await sign.signTypedDataAsync({ domain, types: quoteTypedDataTypes, primaryType: "Quote", message });
      signature = sig;
    }
    write.writeContract({
      address: d.vault,
      abi: makerVaultAbi,
      functionName: "registerQuote",
      args: [
        {
          maker: q.maker,
          marketKey: q.marketKey,
          policyVersion: q.policyVersion,
          borrower: q.borrower,
          collateralToken: q.collateralToken,
          collateralAmount: q.collateralAmount,
          debtToken: q.debtToken,
          cashOut: q.cashOut,
          maxDebtRepay: q.maxDebtRepay,
          collateralRecipient: q.collateralRecipient,
          keeperFee: q.keeperFee,
          protocolFee: q.protocolFee,
          minNetSurplus: q.minNetSurplus,
          surplusRecipient: q.surplusRecipient,
          validUntil: q.validUntil,
          nonce: q.nonce,
        },
        signature,
      ],
    });
  }

  if (!d) {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-semibold">Liquidity</h1>
        <p className="mt-2 text-zinc-400">{net.note}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Liquidity</h1>
        <p className="text-sm text-zinc-500">Maker cash accounts and funded quotes on {net.chain.name}.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-4 p-5">
          <h2 className="font-medium">Demo tokens</h2>
          <p className="text-xs text-zinc-500">Testnet faucet mints capped tUSDC / stock tokens per wallet.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => faucet(d.usdc)} disabled={confirming}>
              Faucet tUSDC
            </button>
            <button type="button" className="btn-ghost" onClick={() => faucet(d.tsla)} disabled={confirming}>
              Faucet tTSLA
            </button>
          </div>
        </div>
        <div className="card space-y-3 p-5">
          <h2 className="font-medium">Maker cash</h2>
          <p className="text-sm text-zinc-400">
            Available: {liquidity.data !== undefined ? formatUnitsExact(liquidity.data as bigint, 6, 2) : "…"} tUSDC
          </p>
          <label className="block text-xs text-zinc-500">
            Deposit (tUSDC)
            <input className="input mt-1" value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} />
          </label>
          <button type="button" className="btn-primary" onClick={deposit} disabled={confirming}>
            Add funds
          </button>
          <label className="block text-xs text-zinc-500">
            Withdraw available
            <input className="input mt-1" value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} />
          </label>
          <button type="button" className="btn-ghost" onClick={withdraw} disabled={confirming}>
            Withdraw
          </button>
        </div>
      </div>
      <div className="card space-y-4 p-5">
        <h2 className="font-medium text-nectar-amber">Publish funded quote</h2>
        <p className="text-xs text-zinc-500">Registers onchain and reserves full cashOut before the quote becomes executable.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-500">
            Market
            <select className="input mt-1" value={selectedMarket} onChange={(e) => setSelectedMarket(e.target.value)}>
              <option value="">Select…</option>
              {chain?.markets.map((m) => (
                <option key={m.marketKey} value={m.marketKey}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-500">
            Borrower scope
            <select className="input mt-1" value={selectedBorrower} onChange={(e) => setSelectedBorrower(e.target.value)}>
              <option value="">First at-risk position</option>
              {positions.map((p) => (
                <option key={p.borrower} value={p.borrower}>
                  {p.label} {p.borrower.slice(0, 8)}… ({p.status})
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" className="btn-primary" onClick={publishQuote} disabled={confirming || !chain}>
          Sign & publish quote
        </button>
      </div>
      {chain && (
        <div className="card p-5">
          <h2 className="font-medium">Your quotes</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {chain.quotes
              .filter((q) => address && q.maker.toLowerCase() === address.toLowerCase())
              .map((q) => (
                <li key={q.quoteId} className="flex justify-between border-b border-nectar-border/40 py-2">
                  <span className="font-mono text-xs">{q.quoteId.slice(0, 12)}…</span>
                  <span>{q.state}</span>
                  <span>{formatUnitsExact(q.cashOut, 6, 0)} tUSDC</span>
                </li>
              ))}
            {!address && <li className="text-zinc-500">Connect wallet to see quotes.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
