/** Local anvil smoke: stress oracles, register quote, one keeper tick. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  anvilLocal,
  EventCache,
  keeperTick,
  makerVaultAbi,
  mockOracleAbi,
  readChainState,
  suggestedQuoteFromPosition,
  type Deployment,
} from "@nectar/core";

const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const d = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../deployments/31337.json"), "utf8")) as Deployment;
const account = privateKeyToAccount(ANVIL_KEY);
const transport = http("http://127.0.0.1:8545");
const publicClient = createPublicClient({ chain: anvilLocal, transport });
const wallet = createWalletClient({ chain: anvilLocal, transport, account });
const cache = new EventCache(publicClient, d, { chunk: 1_000_000n, reorgWindow: 5 });

async function main() {
const state0 = await readChainState(publicClient, d, cache);
for (const m of state0.markets.filter((x) => x.oracle.openStress)) {
  const target = (BigInt(m.oracle.referenceLoanUnits) * 85n) / 100n;
  const price = (target * 10n ** 36n) / 10n ** BigInt(m.collateralToken.decimals);
  await wallet.writeContract({ address: m.oracle.address, abi: mockOracleAbi, functionName: "setPrice", args: [price] });
  console.log("stressed", m.label);
}

const state1 = await readChainState(publicClient, d, cache);
const pos = state1.positions.find((p) => p.status === "liquidatable") ?? state1.positions.find((p) => p.status === "at-risk");
if (!pos) throw new Error("no position");
const market = state1.markets.find((m) => m.marketKey === pos.marketKey)!;
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
await wallet.writeContract({
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
console.log("quote registered for", pos.borrower);

const state2 = await readChainState(publicClient, d, cache);
console.log(
  "liquidatable",
  state2.positions.filter((p) => p.status === "liquidatable").map((p) => p.borrower),
);
console.log("active quotes", state2.quotes.filter((q) => q.state === "Active").length);

const res = await keeperTick(publicClient, wallet, d, cache, {
  log: (m) => console.log(m),
});
console.log(
  "keeper decisions:",
  res.decisions.map((x) => `${x.state}:${x.code}`).join(", ") || "none",
);
const included = res.decisions.find((x) => x.state === "Included");
if (!included) process.exit(1);
console.log("OK liquidation tx", included.txHash);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
