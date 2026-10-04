import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const manifest = path.join(root, "deployments/protocol-local.json");
if (!fs.existsSync(manifest)) {
  execFileSync("node", [path.join(root, "scripts/bootstrap.mjs")], { stdio: "inherit" });
}
const env = {
  ...process.env,
  MANIFEST: manifest,
  RPC_URL: process.env.RPC_URL ?? "http://127.0.0.1:8545",
  PORT: process.env.PORT ?? "8787",
  API_PROXY: "http://127.0.0.1:8787",
};
const tsx = path.join(root, "node_modules/tsx/dist/cli.mjs");
spawn(process.execPath, [tsx, "src/protocolServer.ts"], {
  cwd: path.join(root, "api"),
  env,
  detached: true,
  stdio: "ignore",
}).unref();
spawn(process.execPath, [path.join(root, "web/node_modules/next/dist/bin/next"), "dev", "-p", "3000"], {
  cwd: path.join(root, "web"),
  env,
  detached: true,
  stdio: "ignore",
}).unref();
console.log("API http://127.0.0.1:8787/health");
console.log("Web http://127.0.0.1:3000");
