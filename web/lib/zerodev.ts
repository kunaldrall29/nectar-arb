"use client";

import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";

export const ZERODEV_PROJECT_ID = "61016d2a-e0df-4350-929c-d5f2110700d1";
export const ZERODEV_BUNDLER_RPC = `https://rpc.zerodev.app/api/v3/${ZERODEV_PROJECT_ID}/chain/421614`;

/** Builds a Kernel account client against the Arbitrum Sepolia ZeroDev bundler. */
export async function createSepoliaKernelClient() {
  const entryPoint = getEntryPoint("0.7");
  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(ZERODEV_BUNDLER_RPC),
  });
  const signer = privateKeyToAccount(generatePrivateKey());
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion: KERNEL_V3_1,
  });
  const account = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint,
    kernelVersion: KERNEL_V3_1,
  });
  const client = createKernelAccountClient({
    account,
    chain: arbitrumSepolia,
    bundlerTransport: http(ZERODEV_BUNDLER_RPC),
  });
  return {
    projectId: ZERODEV_PROJECT_ID,
    bundler: ZERODEV_BUNDLER_RPC,
    chainId: arbitrumSepolia.id,
    address: client.account?.address ?? account.address,
  };
}
