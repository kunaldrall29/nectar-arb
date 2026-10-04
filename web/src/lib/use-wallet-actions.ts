"use client";

import { useAccount, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useCallback } from "react";
import type { Abi, Address, ContractFunctionArgs, ContractFunctionName, Hash } from "viem";
import { isDemoMode, useDemoWallet } from "./demo-wallet";
import { useNetwork } from "./network-context";

type WriteReq = {
  address: Address;
  abi: Abi;
  functionName: ContractFunctionName;
  args?: ContractFunctionArgs;
};

export function useWalletActions() {
  const demo = useDemoWallet();
  const { net } = useNetwork();
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const write = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: write.data });

  const effectiveAddress = isDemoMode && demo ? demo.address : address;
  const effectiveChainId = isDemoMode && demo ? demo.chainId : chainId;

  const ensureChain = useCallback(async () => {
    if (isDemoMode && demo) return;
    if (!address) throw new Error("Connect wallet");
    if (chainId !== net.chain.id) await switchChainAsync({ chainId: net.chain.id });
  }, [address, chainId, demo, net.chain.id, switchChainAsync]);

  const writeContract = useCallback(
    async (req: WriteReq): Promise<Hash> => {
      if (isDemoMode && demo) {
        return demo.writeContract(req);
      }
      await ensureChain();
      return write.writeContractAsync(req as never);
    },
    [demo, ensureChain, write],
  );

  const waitForTx = useCallback(
    async (hash: Hash) => {
      if (isDemoMode && demo) {
        await demo.waitForTx(hash);
        return;
      }
      // wagmi hook already tracks write.data; poll via public client in caller if needed
      await new Promise((r) => setTimeout(r, 500));
    },
    [demo],
  );

  return {
    address: effectiveAddress,
    chainId: effectiveChainId,
    writeContract,
    waitForTx,
    confirming: isDemoMode ? false : confirming,
    isSuccess: isDemoMode ? true : isSuccess,
    lastHash: write.data,
    ensureChain,
    isDemo: isDemoMode && !!demo,
  };
}
