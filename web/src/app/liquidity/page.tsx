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
import { maxUint256 } from "viem";
import { useSignTypedData } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { useNetwork } from "@/lib/network-context";
import { useChainState, usePublicClient } from "@/lib/use-chain-state";
import { useWalletActions } from "@/lib/use-wallet-actions";
import { isDemoMode } from "@/lib/demo-wallet";

export default function LiquidityPage() {
  const { net } = useNetwork();
  const d = net.deployment;
  const { data: chain, refetch } = useChainState();
  const { address, writeContract, waitForTx, confirming } = useWalletActions();
  const publicClient = usePublicClient();
  const sign = useSignTypedData();
  const [depositAmt, setDepositAmt] = useState("5000");
  const [withdrawAmt, setWithdrawAmt] = useState("100");
  const [selectedMarket, setSelectedMarket] = useState<string>("");
  const [selectedBorrower, setSelectedBorrower] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [quoteStatus, setQuoteStatus] = useState<string | null>(null);

  const liquidity = useQuery({
    queryKey: ["available", d?.vault, d?.usdc, address],
    enabled: !!d && !!address,
    queryFn: () =>
      publicClient.readContract({
        address: d!.vault,
        abi: makerVaultAbi,
        functionName: "available",
        args: [address!, d!.usdc],
      }),
    refetchInterval: 3000,
  });

  const positions = useMemo(() => {
    if (!chain) return [];
    return chain.positions.filter((p) => p.status === "liquidatable" || p.status === "at-risk");
  }, [chain]);

  async function faucet(token: `0x${string}`) {
    setBusy(true);
    try {
      const h = await writeContract({ address: token, abi: testTokenAbi, functionName: "faucet" });
      await waitForTx(h);
      await liquidity.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function deposit() {
    if (!d || !address) return;
    setBusy(true);
    try {
      const amount = parseUnitsExact(depositAmt, 6);
      const ah = await writeContract({
        address: d.usdc,
        abi: testTokenAbi,
        functionName: "approve",
        args: [d.vault, maxUint256],
      });
      await waitForTx(ah);
      const dh = await writeContract({
        address: d.vault,
        abi: makerVaultAbi,
        functionName: "deposit",
        args: [d.usdc, amount, address],
      });
      await waitForTx(dh);
      await liquidity.refetch();
      await refetch();
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!d || !address) return;
    setBusy(true);
    try {
      const amount = parseUnitsExact(withdrawAmt, 6);
      const h = await writeContract({
        address: d.vault,
        abi: makerVaultAbi,
        functionName: "withdraw",
        args: [d.usdc, amount, address],
      });
      await waitForTx(h);
      await liquidity.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function publishQuote() {
    if (!d || !chain || !address) return;
    setBusy(true);
    setQuoteStatus("Publishing quote…");
    try {
      const market = chain.markets.find((m) => m.marketKey === selectedMarket) ?? chain.markets[0];
      const pool = positions.filter((p) => !selectedMarket || p.marketKey === selectedMarket);
      const pos =
        (selectedBorrower ? pool.find((p) => p.borrower === selectedBorrower) : undefined) ??
        pool.sort((a, b) => (BigInt(a.debt) > BigInt(b.debt) ? 1 : -1))[0] ??
        positions.sort((a, b) => (BigInt(a.debt) > BigInt(b.debt) ? 1 : -1))[0];
      if (!market || !pos) throw new Error("Pick a market and position");
      const mkt = chain.markets.find((x) => x.marketKey === pos.marketKey)!;
      const validUntil = BigInt(Math.floor(Date.now() / 1000) + 600);
      const nonce = BigInt(Date.now());
      const maxRepay = pos.suggested?.maxDebtRepay ? BigInt(pos.suggested.maxDebtRepay) : BigInt(pos.debt) + 500n * 10n ** 6n;
      const collateralAmt = pos.suggested?.collateralAmount ? BigInt(pos.suggested.collateralAmount) : BigInt(pos.collateral);
      const q = suggestedQuoteFromPosition(
        d,
        mkt.marketKey as Hex,
        mkt.policy.version,
        address,
        mkt.collateralToken.address,
        mkt.loanToken.address,
        collateralAmt,
        maxRepay,
        validUntil,
        nonce,
        pos.borrower as `0x${string}`,
      );
      let signature: Hex = "0x";
      if (!isDemoMode) {
        const message = quoteToTypedMessage(q);
        const domain = quoteDomain(d.chainId, d.vault);
        signature = await sign.signTypedDataAsync({ domain, types: quoteTypedDataTypes, primaryType: "Quote", message });
      }
      const h = await writeContract({
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
      await waitForTx(h);
      await refetch();
      setQuoteStatus("Quote registered onchain — cash reserved.");
    } catch (e) {
      setQuoteStatus(`Failed: ${(e as Error).message?.slice(0, 120) ?? "unknown"}`);
      throw e;
    } finally {
      setBusy(false);
    }
  }

  const pending = busy || confirming;

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
          <p className="text-xs text-zinc-500">Testnet faucet mints capped tUSDC per wallet.</p>
          <button
            type="button"
            data-testid="faucet-usdc"
            className="btn-ghost"
            onClick={() => faucet(d.usdc)}
            disabled={pending}
          >
            Faucet tUSDC
          </button>
        </div>
        <div className="card space-y-3 p-5">
          <h2 className="font-medium">Maker cash</h2>
          <p className="text-sm text-zinc-400" data-testid="maker-available">
            Available: {liquidity.data !== undefined ? formatUnitsExact(liquidity.data as bigint, 6, 2) : "…"} tUSDC
          </p>
          <label className="block text-xs text-zinc-500">
            Deposit (tUSDC)
            <input className="input mt-1" value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} />
          </label>
          <button type="button" data-testid="deposit-btn" className="btn-primary" onClick={deposit} disabled={pending}>
            Add funds (approve + deposit)
          </button>
        </div>
      </div>
      <div className="card space-y-4 p-5">
        <h2 className="font-medium text-nectar-amber">Publish funded quote</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-500">
            Market
            <select className="input mt-1" value={selectedMarket} onChange={(e) => setSelectedMarket(e.target.value)}>
              <option value="">First market</option>
              {chain?.markets.map((m) => (
                <option key={m.marketKey} value={m.marketKey}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-500">
            Borrower
            <select className="input mt-1" value={selectedBorrower} onChange={(e) => setSelectedBorrower(e.target.value)}>
              <option value="">First at-risk / liquidatable</option>
              {positions.map((p) => (
                <option key={p.borrower} value={p.borrower}>
                  {p.label} ({p.status})
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          data-testid="publish-quote-btn"
          className="btn-primary"
          onClick={() => publishQuote().catch(() => undefined)}
          disabled={pending || !chain}
        >
          Sign & publish quote
        </button>
        {quoteStatus && (
          <p className="text-sm text-zinc-400" data-testid="quote-status">
            {quoteStatus}
          </p>
        )}
      </div>
    </div>
  );
}
