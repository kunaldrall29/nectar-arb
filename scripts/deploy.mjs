#!/usr/bin/env node
// Usage: node scripts/deploy.mjs <local-arb|local-rh|arb-sepolia|robinhood-testnet>
// Reads DEPLOYER_PRIVATE_KEY from the environment or the repo-root .env (never committed).
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANVIL_KEY_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function loadDotEnv() {
  for (const f of [path.join(root, ".env"), process.env.DEPLOYER_ENV_FILE].filter(Boolean)) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadDotEnv();

const targets = {
  "local-arb": { rpc: process.env.LOCAL_ARB_RPC_URL ?? "http://127.0.0.1:8545", chainId: 421614, manifest: "local-421614", name: "Local anvil (Arbitrum Sepolia config)", local: true },
  "local-rh": { rpc: process.env.LOCAL_RH_RPC_URL ?? "http://127.0.0.1:8546", chainId: 46630, manifest: "local-46630", name: "Local anvil (Robinhood Chain Testnet config)", local: true },
  "arb-sepolia": { rpc: process.env.ARB_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc", chainId: 421614, manifest: "421614", name: "Arbitrum Sepolia" },
  "robinhood-testnet": { rpc: process.env.ROBINHOOD_TESTNET_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com", chainId: 46630, manifest: "46630", name: "Robinhood Chain Testnet" },
};

const targetName = process.argv[2];
const t = targets[targetName];
if (!t) {
  console.error(`usage: deploy.mjs <${Object.keys(targets).join("|")}>`);
  process.exit(1);
}

const pk = t.local ? (process.env.LOCAL_DEPLOYER_PRIVATE_KEY ?? ANVIL_KEY_0) : process.env.DEPLOYER_PRIVATE_KEY;
if (!pk) {
  console.error("DEPLOYER_PRIVATE_KEY is not set (env or .env). See .env.example.");
  process.exit(1);
}

const forgeBin = fs.existsSync(path.join(process.env.HOME, ".foundry/bin/forge")) ? path.join(process.env.HOME, ".foundry/bin/forge") : "forge";
const castBin = forgeBin.replace(/forge$/, "cast");

const chainId = Number(execFileSync(castBin, ["chain-id", "--rpc-url", t.rpc]).toString().trim());
if (chainId !== t.chainId) {
  console.error(`RPC ${t.rpc} reports chain ${chainId}, expected ${t.chainId}. Refusing to deploy.`);
  process.exit(1);
}
const address = execFileSync(castBin, ["wallet", "address", "--private-key", pk]).toString().trim();
const balance = BigInt(execFileSync(castBin, ["balance", address, "--rpc-url", t.rpc]).toString().trim());
console.log(`Deploying Nectar to ${t.name} (chain ${chainId}) from ${address}, balance ${Number(balance) / 1e18} ETH`);
if (balance === 0n) {
  console.error(`Deployer ${address} has no gas on ${t.name}. Fund it from a faucet first.`);
  process.exit(2);
}

let commit = "unknown";
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim();
} catch {}

const manifestPath = path.join(root, "deployments", `${t.manifest}.json`);
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
const args = ["script", "script/Deploy.s.sol", "--rpc-url", t.rpc, "--broadcast"];
if (!t.local) args.push("--slow");
const res = spawnSync(forgeBin, args, {
  cwd: path.join(root, "contracts"),
  stdio: "inherit",
  env: { ...process.env, PRIVATE_KEY: pk, NETWORK_NAME: t.name, MANIFEST_NAME: t.manifest, GIT_COMMIT: commit },
});
if (res.status !== 0) {
  if (fs.existsSync(manifestPath)) fs.rmSync(manifestPath);
  console.error("forge script failed; manifest discarded.");
  process.exit(res.status ?? 1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const runFile = path.join(root, "contracts", "broadcast", "Deploy.s.sol", String(chainId), "run-latest.json");
if (fs.existsSync(runFile)) {
  const run = JSON.parse(fs.readFileSync(runFile, "utf8"));
  const blocks = run.receipts.map((r) => Number(BigInt(r.blockNumber)));
  manifest.deploymentBlock = Math.min(...blocks);
  manifest.deploymentTxs = run.receipts.map((r) => r.transactionHash);
}
manifest.mode = t.local ? "local" : "testnet";
manifest.rpcUrl = t.local ? t.rpc : undefined;
manifest.publicRpcUrl = t.local ? undefined : t.rpc;
manifest.deployedAtIso = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Manifest written: deployments/${t.manifest}.json`);

execFileSync("node", [path.join(root, "scripts", "export-abi.mjs")], { stdio: "inherit" });
