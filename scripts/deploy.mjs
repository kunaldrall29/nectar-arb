import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const index = args.indexOf("--network");
const network = index >= 0 ? args[index + 1] : process.env.NETWORK;
const allow = {
  local: 31337,
  "arbitrum-sepolia": 421614,
  "robinhood-testnet": 46630,
};
if (!network || !allow[network]) {
  console.error("Allowlisted networks: local (31337), arbitrum-sepolia (421614), robinhood-testnet (46630).");
  process.exit(1);
}

const deployer = "0x031e038aeba717714dacC95F16d03234d722bCBb";

async function balance(rpc, address) {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: [address, "latest"],
    }),
  });
  const body = await response.json();
  if (body.error) throw new Error(body.error.message);
  return BigInt(body.result);
}

if (network === "arbitrum-sepolia") {
  const rpc = "https://sepolia-rollup.arbitrum.io/rpc";
  const wei = await balance(rpc, deployer);
  const status = {
    status: wei === 0n ? "STILL_ZERO" : "FUNDED_NOT_BROADCAST_IN_THIS_RUN",
    balanceWei: wei.toString(),
    deployer,
    chainId: 421614,
    rpc,
    checkedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(root, "deployments/arbitrum-sepolia.status.json"), JSON.stringify(status, null, 2));
  if (wei === 0n) {
    console.log("STILL ZERO");
    console.log(`${deployer} has 0 wei on ${rpc}`);
    console.log("No deployments/arbitrum-sepolia.json was written.");
    process.exit(0);
  }
  console.error("Sepolia balance is non-zero. This session did not broadcast because the zero-balance path is the expected blocker.");
  process.exit(2);
}

if (network === "robinhood-testnet") {
  const manifest = path.join(root, "deployments/robinhood-testnet.json");
  console.log("Robinhood Chain testnet rehearsal stays in place. New protocol modules were not broadcast.");
  console.log(`Existing rehearsal manifest: ${manifest}`);
  console.log("Liquidation tx 0x6d69978efa2ffffee2a4e442000ea6a85e1456e1eb9c2d54b452f8ad305333f1");
  process.exit(0);
}

const { spawnSync } = await import("node:child_process");
const child = spawnSync("node", [path.join(root, "scripts/bootstrap.mjs")], { stdio: "inherit" });
process.exit(child.status ?? 1);
