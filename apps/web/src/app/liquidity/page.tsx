"use client";

import { useState } from "react";
import { useAccount, useWriteContract, usePublicClient, useWalletClient } from "wagmi";
import { parseUnits, type Address, keccak256, encodePacked, stringToHex } from "viem";
import { Shell } from "@/components/Shell";
import { deployment, escrowAbi, erc20Abi } from "@/lib/contracts";

export default function LiquidityPage() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [amount, setAmount] = useState("10000");
  const [status, setStatus] = useState<string>("");

  const debtToken = deployment.contracts.DebtToken as Address;
  const escrow = deployment.contracts.QuoteEscrow as Address;

  async function deposit() {
    if (!address) return;
    setStatus("Depositing...");
    const value = parseUnits(amount, 6);
    await writeContractAsync({ address: debtToken, abi: erc20Abi, functionName: "mint", args: [address, value] });
    await writeContractAsync({
      address: debtToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [escrow, value],
    });
    await writeContractAsync({
      address: escrow,
      abi: escrowAbi,
      functionName: "deposit",
      args: [debtToken, value, address],
    });
    setStatus("Deposit confirmed");
  }

  async function publishQuote() {
    if (!address || !walletClient || !publicClient) return;
    setStatus("Signing EIP-712 quote...");
    const reservationId = keccak256(encodePacked(["string", "address"], ["demo-res", address]));
    const validUntil = BigInt(Math.floor(Date.now() / 1000) + 120);
    const quote = {
      schemaVersion: 1n,
      chainId: BigInt(deployment.chainId),
      verifyingContract: escrow,
      maker: address,
      makerNonce: 0n,
      marketKey: deployment.marketKey as `0x${string}`,
      adapterVersion: 1n,
      borrower: "0x0000000000000000000000000000000000000001" as Address,
      collateralToken: deployment.contracts.CollateralToken as Address,
      collateralAmount: parseUnits("1", 18),
      debtToken,
      cashOut: parseUnits("10140", 6),
      maxDebtRepay: parseUnits("10000", 6),
      collateralRecipient: address,
      keeperCompensation: parseUnits("50", 6),
      protocolFee: parseUnits("20", 6),
      minNetSurplus: parseUnits("70", 6),
      keeperRecipient: address,
      surplusRecipient: address,
      validUntil,
      reservationId,
      policyHash: keccak256(stringToHex("policy-v1-testnet")),
      quoteNonce: keccak256(stringToHex("quote-demo-1")),
    };

    const domain = {
      name: "NectarQuoteEscrow",
      version: "1",
      chainId: deployment.chainId,
      verifyingContract: escrow,
    } as const;

    const types = {
      FundedQuote: [
        { name: "schemaVersion", type: "uint256" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
        { name: "maker", type: "address" },
        { name: "makerNonce", type: "uint256" },
        { name: "marketKey", type: "bytes32" },
        { name: "adapterVersion", type: "uint256" },
        { name: "borrower", type: "address" },
        { name: "collateralToken", type: "address" },
        { name: "collateralAmount", type: "uint256" },
        { name: "debtToken", type: "address" },
        { name: "cashOut", type: "uint256" },
        { name: "maxDebtRepay", type: "uint256" },
        { name: "collateralRecipient", type: "address" },
        { name: "keeperCompensation", type: "uint256" },
        { name: "protocolFee", type: "uint256" },
        { name: "minNetSurplus", type: "uint256" },
        { name: "keeperRecipient", type: "address" },
        { name: "surplusRecipient", type: "address" },
        { name: "validUntil", type: "uint256" },
        { name: "reservationId", type: "bytes32" },
        { name: "policyHash", type: "bytes32" },
        { name: "quoteNonce", type: "bytes32" },
      ],
    } as const;

    const signature = await walletClient.signTypedData({ account: address, domain, types, primaryType: "FundedQuote", message: quote });
    await writeContractAsync({ address: escrow, abi: escrowAbi, functionName: "registerQuote", args: [quote, signature] });
    setStatus(`Quote registered: ${reservationId}`);
  }

  return (
    <Shell>
      <h2 className="text-2xl font-semibold mb-2">Liquidity</h2>
      <p className="text-sm text-slate-400 mb-6">Add funds, publish funded quotes, view commitments.</p>
      {!isConnected && <p className="text-amber-300">Connect wallet on Arbitrum Sepolia.</p>}
      <div className="flex flex-col gap-3 max-w-md">
        <label className="text-sm">Deposit amount (tUSDC)</label>
        <input className="bg-black/30 border border-white/10 rounded-lg px-3 py-2" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="bg-nectar-accent text-black font-medium rounded-lg px-4 py-2" onClick={deposit} disabled={!isConnected}>
          Add funds
        </button>
        <button className="bg-nectar-mint/20 border border-nectar-mint rounded-lg px-4 py-2" onClick={publishQuote} disabled={!isConnected}>
          Publish quote (EIP-712)
        </button>
        {status && <p className="text-sm text-slate-300">{status}</p>}
      </div>
    </Shell>
  );
}
