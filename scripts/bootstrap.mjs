import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const anvilKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function rpcCall(method, params = []) {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

async function ensureAnvil() {
  try {
    const chainId = Number(await rpcCall("eth_chainId"));
    if (chainId !== 31337) throw new Error(`Refusing bootstrap on chain ${chainId}`);
    return;
  } catch (error) {
    if (String(error.message).startsWith("Refusing")) throw error;
  }
  const child = spawn("anvil", ["--host", "127.0.0.1", "--port", "8545", "--chain-id", "31337"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  for (let i = 0; i < 40; i++) {
    try {
      const chainId = Number(await rpcCall("eth_chainId"));
      if (chainId === 31337) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("Anvil did not start on 127.0.0.1:8545");
}

function parseAddrs(output) {
  const found = {};
  for (const line of output.split("\n")) {
    const match = line.match(/ADDR (\w+) (0x[0-9a-fA-F]+|\d+)/);
    if (match) found[match[1]] = match[2];
  }
  return found;
}

await ensureAnvil();
const output = execFileSync(
  "forge",
  [
    "script",
    "script/DeployLocal.s.sol:DeployLocal",
    "--root",
    path.join(root, "packages/contracts"),
    "--rpc-url",
    rpc,
    "--broadcast",
    "--slow",
  ],
  {
    encoding: "utf8",
    env: { ...process.env, PRIVATE_KEY: anvilKey, PATH: process.env.PATH },
    maxBuffer: 20 * 1024 * 1024,
  },
);
const addr = parseAddrs(output);
const required = ["quoteEscrow", "executor", "marketRegistry", "sandboxMorpho", "propPool", "marketId"];
for (const key of required) {
  if (!addr[key]) throw new Error(`Deploy log missing ${key}`);
}
const code = await rpcCall("eth_getCode", [addr.quoteEscrow, "latest"]);
if (!code || code === "0x") throw new Error("Quote escrow has no code after deploy");

const manifest = {
  protocol: "evm-v1",
  audited: false,
  sandbox: true,
  officialMorpho: false,
  chainId: 31337,
  networkName: "Local Anvil",
  debtSymbol: "nUSD",
  collateralSymbol: "nSTK",
  debtName: "Nectar Rehearsal USD",
  collateralName: "Nectar Rehearsal Collateral",
  debtDecimals: 6,
  collateralDecimals: 18,
  repayAssets: "10000",
  lltv: "800000000000000000",
  quoteEscrow: addr.quoteEscrow,
  executor: addr.executor,
  marketRegistry: addr.marketRegistry,
  adapter: addr.adapter,
  sandboxMorpho: addr.sandboxMorpho,
  propFactory: addr.propFactory,
  propPool: addr.propPool,
  riskGuard: addr.riskGuard,
  swapAdapter: addr.swapAdapter,
  router: addr.router,
  debtToken: addr.debtToken,
  collateralToken: addr.collateralToken,
  oracle: addr.oracle,
  marketId: addr.marketId,
  policyId: addr.policyId,
  quoteBorrower: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  propBorrower: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  maker: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  keeper: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  pricingUpdater: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  deployer: addr.deployer,
  protocolFeeRecipient: addr.deployer,
  surplusRecipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  startBlock: Number(addr.startBlock ?? 0),
  notes: [
    "Local protocol deploy. Nectar Sandbox Morpho is not an official Morpho deployment.",
    "nUSD is a rehearsal token, not Paxos USDG.",
    "This file is not an Arbitrum Sepolia or Robinhood deployment.",
  ],
};
const file = path.join(root, "deployments/protocol-local.json");
fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
console.log(`protocol manifest ${file}`);
console.log(`quoteEscrow ${manifest.quoteEscrow}`);
console.log(`executor ${manifest.executor}`);
