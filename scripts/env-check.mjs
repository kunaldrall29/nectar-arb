import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const allow = [31337, 421614, 46630];
console.log(`node ${process.version}`);
try {
  console.log(execFileSync("forge", ["--version"], { encoding: "utf8" }).split("\n")[0]);
} catch {
  console.log("forge missing");
}
try {
  console.log(`pnpm ${execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim()}`);
} catch {
  console.log("pnpm missing");
}
let docker = false;
try {
  execFileSync("docker", ["info"], { stdio: "ignore" });
  docker = true;
} catch {
  docker = false;
}
console.log(`docker ${docker ? "available" : "not available; local store is sqlite"}`);
console.log(`chain allowlist ${allow.join(",")}`);

const deployer = "0x031e038aeba717714dacC95F16d03234d722bCBb";
const rpc = "https://sepolia-rollup.arbitrum.io/rpc";
const response = await fetch(rpc, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [deployer, "latest"] }),
});
const body = await response.json();
const wei = BigInt(body.result ?? "0x0");
console.log(`arbitrum-sepolia deployer balance wei ${wei.toString()}`);
if (wei === 0n) console.log("STILL ZERO");
console.log(`robinhood rehearsal manifest ${fs.existsSync(path.join(root, "deployments/robinhood-testnet.json"))}`);
console.log(`protocol local manifest ${fs.existsSync(path.join(root, "deployments/protocol-local.json"))}`);
console.log("sqlite node:sqlite is the local substitute for Postgres");
