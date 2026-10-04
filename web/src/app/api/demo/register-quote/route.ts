import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  anvilLocal,
  EventCache,
  makerVaultAbi,
  readChainState,
  suggestedQuoteFromPosition,
  type Deployment,
} from "@nectar/core";

const DEMO = process.env.NEXT_PUBLIC_NECTAR_DEMO === "1";
const KEY = (process.env.DEMO_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as `0x${string}`;
const LOCAL = process.env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545";

export async function POST() {
  if (!DEMO) return NextResponse.json({ error: "disabled" }, { status: 403 });
  const d = JSON.parse(readFileSync(join(process.cwd(), "..", "deployments", "31337.json"), "utf8")) as Deployment;
  const account = privateKeyToAccount(KEY);
  const transport = http(LOCAL);
  const publicClient = createPublicClient({ chain: anvilLocal, transport });
  const wallet = createWalletClient({ chain: anvilLocal, transport, account });
  const cache = new EventCache(publicClient, d, { chunk: 1_000_000n, reorgWindow: 12 });
  const state = await readChainState(publicClient, d, cache);
  const pos = [...state.positions]
    .filter((p) => p.status === "liquidatable")
    .sort((a, b) => (BigInt(a.debt) > BigInt(b.debt) ? 1 : -1))[0];
  if (!pos) return NextResponse.json({ error: "no liquidatable position" }, { status: 400 });
  const m = state.markets.find((x) => x.marketKey === pos.marketKey)!;
  const block = await publicClient.getBlock();
  const sug = pos.suggested;
  const q = suggestedQuoteFromPosition(
    d,
    m.marketKey,
    m.policy.version,
    account.address,
    m.collateralToken.address,
    m.loanToken.address,
    sug ? BigInt(sug.collateralAmount) : BigInt(pos.collateral),
    sug ? BigInt(sug.maxDebtRepay) : BigInt(pos.debt) + 500_000_000n,
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
  return NextResponse.json({ ok: true, hash, borrower: pos.borrower });
}
