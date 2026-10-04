"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, type Hex } from "viem";
import { makerEscrowAbi, mockErc20Abi } from "@/generated/abis";
import { getDeployments } from "@/lib/data";

export function MakerPanel() {
  const { address, chain } = useAccount();
  const [amount, setAmount] = useState("1000");
  const [networkKey, setNetworkKey] = useState("local-421614");
  const dep = getDeployments().find((d) => d.file.replace(".json", "") === networkKey);
  const debt = dep?.contracts.DebtToken as Hex | undefined;
  const escrow = dep?.contracts.MakerEscrow as Hex | undefined;

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash });

  const wrongChain = dep && chain?.id !== dep.chainId;

  function deposit() {
    if (!debt || !escrow || !address) return;
    const units = parseUnits(amount, 6);
    writeContract({
      address: debt,
      abi: mockErc20Abi,
      functionName: "mint",
      args: [address, units],
      chainId: dep!.chainId,
    });
    writeContract({
      address: debt,
      abi: mockErc20Abi,
      functionName: "approve",
      args: [escrow, units],
      chainId: dep!.chainId,
    });
    writeContract({
      address: escrow,
      abi: makerEscrowAbi,
      functionName: "deposit",
      args: [debt, units, address],
      chainId: dep!.chainId,
    });
  }

  function withdraw() {
    if (!debt || !escrow || !address) return;
    const units = parseUnits(amount, 6);
    writeContract({
      address: escrow,
      abi: makerEscrowAbi,
      functionName: "withdraw",
      args: [debt, units, address],
      chainId: dep!.chainId,
    });
  }

  return (
    <div className="rounded-xl border border-nectar-border bg-nectar-panel p-4 space-y-3">
      <h2 className="font-medium">Maker actions</h2>
      <p className="text-xs text-slate-500">Sign on the deployment chain. Publish quote uses the backend seed flow in this demo.</p>
      <label className="block text-xs text-slate-400">
        Deployment manifest
        <select
          className="mt-1 w-full rounded border border-nectar-border bg-nectar-bg px-2 py-1.5 text-sm"
          value={networkKey}
          onChange={(e) => setNetworkKey(e.target.value)}
        >
          {getDeployments().map((d) => (
            <option key={d.file} value={d.file.replace(".json", "")}>
              {d.network} ({d.chainId})
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-slate-400">
        Amount (6 decimals)
        <input
          className="mt-1 w-full rounded border border-nectar-border bg-nectar-bg px-2 py-1.5 text-sm"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      {wrongChain ? (
        <p className="text-xs text-amber-300">Switch wallet to chain {dep?.chainId} before signing.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!address || isPending || confirming}
          onClick={deposit}
          className="rounded-lg bg-emerald-600/90 px-3 py-1.5 text-sm font-medium disabled:opacity-40"
        >
          Add funds
        </button>
        <button
          type="button"
          disabled={!address || isPending || confirming}
          onClick={withdraw}
          className="rounded-lg border border-nectar-border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Withdraw available
        </button>
      </div>
      {hash ? (
        <p className="text-xs text-slate-500">
          Tx:{" "}
          <a className="text-amber-300 underline" href={`/tx/${hash}`}>
            {hash.slice(0, 10)}…
          </a>
        </p>
      ) : null}
    </div>
  );
}
