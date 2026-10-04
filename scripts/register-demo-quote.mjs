#!/usr/bin/env node
/** Registers a funded quote for the first liquidatable position (local anvil smoke test). */
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  anvilLocal,
  makerVaultAbi,
  suggestedQuoteFromPosition,
  readChainState,
  EventCache,
} from "@nectar/core";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const d = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../deployments/31337.json"), "utf8"));
const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(ANVIL_KEY);
const transport = http("http://127.0.0.1:8545");
const publicClient = createPublicClient({ chain: anvilLocal, transport });
const wallet = createWalletClient({ chain: anvilLocal, transport, account });
const cache = new EventCache(publicClient, d, { chunk: 1_000_000n, reorgWindow: 5 });

const state = await readChainState(publicClient, d, cache);
const pos = state.positions.find((p) => p.status === "liquidatable" || p.status === "at-risk");
if (!pos) throw new Error("No demo position");
const market = state.markets.find((m) => m.marketKey === pos.marketKey)!;
const block = await publicClient.getBlock();
const q = suggestedQuoteFromPosition(
  d,
  market.marketKey,
  market.policy.version,
  account.address,
  market.collateralToken.address,
  market.loanToken.address,
  BigInt(pos.collateral),
  BigInt(pos.debt) + 500n * 10n ** 6n,
  block.timestamp + 600n,
  BigInt(Date.now()),
  pos.borrower,
);
const hash = await wallet.writeContract({
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
    "0x",
  ],
});
await publicClient.waitForTransactionReceipt({ hash });
console.log("registered quote", hash, "for", pos.borrower);
