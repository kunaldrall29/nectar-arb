#!/usr/bin/env node
/** Drops mock oracle price ~15% on all open-stress markets (testnet stress scenario). */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvilLocal, mockOracleAbi, readChainState, EventCache } from "@nectar/core";

const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const d = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../deployments/31337.json"), "utf8"));
const account = privateKeyToAccount(ANVIL_KEY);
const transport = http("http://127.0.0.1:8545");
const publicClient = createPublicClient({ chain: anvilLocal, transport });
const wallet = createWalletClient({ chain: anvilLocal, transport, account });
const cache = new EventCache(publicClient, d, { chunk: 1_000_000n, reorgWindow: 5 });
const state = await readChainState(publicClient, d, cache);

for (const m of state.markets.filter((x) => x.oracle.openStress)) {
  const target = (BigInt(m.oracle.referenceLoanUnits) * 85n) / 100n;
  const price = (target * 10n ** 36n) / 10n ** BigInt(m.collateralToken.decimals);
  const hash = await wallet.writeContract({
    address: m.oracle.address,
    abi: mockOracleAbi,
    functionName: "setPrice",
    args: [price],
  });
  console.log("stressed", m.label, hash);
}
