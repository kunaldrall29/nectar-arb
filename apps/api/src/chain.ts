import { createPublicClient, http, type Address } from "viem";
import { arbitrumSepolia } from "viem/chains";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { quoteEscrowAbi } from "@nectar/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(__dirname, "../../../deployments/manifest.json"), "utf8"),
) as {
  release: string;
  networks: Array<{
    chainId: number;
    status: string;
    rpcUrl?: string;
    contracts?: Record<string, string>;
    marketKey?: string;
    name: string;
    keeperAllowlist?: boolean;
  }>;
};

export function getActiveDeployment(chainId = 421614) {
  const net = manifest.networks.find((n) => n.chainId === chainId && n.status === "active");
  if (!net?.contracts) throw new Error("UNSUPPORTED_MARKET");
  return net;
}

export function makeClient(rpcUrl: string) {
  return createPublicClient({
    chain: { ...arbitrumSepolia, id: 421614 },
    transport: http(rpcUrl),
  });
}

export async function readLiquidity(wallet: Address, chainId = 421614) {
  const net = getActiveDeployment(chainId);
  const client = makeClient(net.rpcUrl ?? process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "http://127.0.0.1:8545");
  const debt = net.contracts!.debtToken as Address;
  const escrow = net.contracts!.quoteEscrow as Address;
  const [cash, reserved] = await Promise.all([
    client.readContract({ address: escrow, abi: quoteEscrowAbi, functionName: "cashBalance", args: [wallet, debt] }),
    client.readContract({ address: escrow, abi: quoteEscrowAbi, functionName: "reservedBalance", args: [wallet, debt] }),
  ]);
  const available = cash > reserved ? cash - reserved : 0n;
  return {
    chainId,
    wallet,
    debtToken: debt,
    cash: cash.toString(),
    reserved: reserved.toString(),
    available: available.toString(),
    blockNumber: (await client.getBlockNumber()).toString(),
  };
}

export { manifest };
