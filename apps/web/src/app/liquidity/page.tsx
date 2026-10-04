"use client";

import { useWallet } from "@/lib/wallet";
import { useEffect, useState } from "react";
import { parseUnits, type Address, encodeFunctionData } from "viem";
import { contracts, CHAIN_ID, MARKET_KEY } from "@/lib/config";
import { quoteEscrowAbi } from "@nectar/shared";

const erc20Abi = [
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "mint", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
] as const;

export default function LiquidityPage() {
  const { address, isConnected, publicClient } = useWallet();
  const [amount, setAmount] = useState("1000");
  const [available, setAvailable] = useState<bigint>();
  const debt = contracts?.debtToken as Address;
  const escrow = contracts?.quoteEscrow as Address;

  useEffect(() => {
    if (!publicClient || !address || !debt || !escrow) return;
    publicClient
      .readContract({ address: escrow, abi: quoteEscrowAbi, functionName: "availableCash", args: [address, debt] })
      .then(setAvailable)
      .catch(() => setAvailable(undefined));
  }, [publicClient, address, debt, escrow]);

  async function sendTx(to: Address, data: `0x${string}`) {
    if (!window.ethereum || !address) return;
    const hash = (await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from: address, to, data }],
    })) as `0x${string}`;
    await publicClient?.waitForTransactionReceipt({ hash });
  }

  async function deposit() {
    if (!address || !debt || !escrow) return;
    const value = parseUnits(amount, 6);
    const mintData = encodeFunctionData({ abi: erc20Abi, functionName: "mint", args: [address, value] });
    await sendTx(debt, mintData);
    const approveData = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [escrow, value] });
    await sendTx(debt, approveData);
    const depData = encodeFunctionData({ abi: quoteEscrowAbi, functionName: "deposit", args: [debt, value, address] });
    await sendTx(escrow, depData);
  }

  async function withdraw() {
    if (!address || !debt || !escrow) return;
    const value = parseUnits(amount, 6);
    const data = encodeFunctionData({ abi: quoteEscrowAbi, functionName: "withdraw", args: [debt, value, address] });
    await sendTx(escrow, data);
  }

  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <section>
        <h1>Liquidity</h1>
        <p className="muted">Maker cash accounts on chain {CHAIN_ID}. Withdrawable excludes active reservations.</p>
      </section>
      <div className="card" style={{ maxWidth: 480 }}>
        <h2>Maker cash</h2>
        <p>Available: {available ? (Number(available) / 1e6).toFixed(2) : "—"} tUSDC</p>
        <div className="field">
          <label htmlFor="amount">Amount (tUSDC)</label>
          <input id="amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          <button type="button" disabled={!isConnected} onClick={() => deposit().catch(console.error)}>Add funds</button>
          <button type="button" className="secondary" disabled={!isConnected} onClick={() => withdraw().catch(console.error)}>
            Withdraw available
          </button>
        </div>
        {!isConnected && <p className="muted">Connect wallet on Arbitrum Sepolia rehearsal ({CHAIN_ID}).</p>}
      </div>
      <div className="card">
        <h2>Publish quote (fixture)</h2>
        <p className="muted">
          Section 9 numerical fixture: cashOut 10,140 with debt repay 10,000, keeper 50, fee 20, surplus 70.
        </p>
        <p className="muted">Market key: {MARKET_KEY}</p>
      </div>
    </div>
  );
}
