#!/usr/bin/env node
/** Starts anvil (if needed), deploys, seeds, runs backend briefly to index + keeper execute. */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forge = path.join(process.env.HOME ?? "", ".foundry/bin/forge");
const cast = path.join(process.env.HOME ?? "", ".foundry/bin/cast");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function waitRpc(url) {
  for (let i = 0; i < 30; i++) {
    const r = spawnSync(cast, ["chain-id", "--rpc-url", url], { encoding: "utf8" });
    if (r.status === 0) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`RPC ${url} not ready`);
}

const arbRpc = "http://127.0.0.1:8545";
if (!spawnSync(cast, ["chain-id", "--rpc-url", arbRpc], { encoding: "utf8" }).stdout?.includes("421614")) {
  console.log("Starting anvil on :8545 …");
  spawn("anvil", ["--chain-id", "421614", "--port", "8545", "--block-time", "1"], {
    cwd: root,
    detached: true,
    stdio: "ignore",
  }).unref();
  await waitRpc(arbRpc);
}

run("node", ["scripts/deploy.mjs", "local-arb"]);
run("npm", ["run", "seed"], { cwd: path.join(root, "backend") });

console.log("Starting backend for 25s (indexer + keeper) …");
const backend = spawn("npx", ["tsx", "src/main.ts"], { cwd: path.join(root, "backend"), stdio: "inherit" });
await new Promise((r) => setTimeout(r, 25_000));
backend.kill("SIGTERM");
run("node", ["scripts/export-snapshot.mjs"]);
console.log("Demo local complete.");
