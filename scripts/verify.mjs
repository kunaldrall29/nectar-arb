import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const forge = spawnSync(
  "forge",
  ["test", "--root", path.join(root, "packages/contracts"), "--match-contract", "NumericalTest", "--offline"],
  { stdio: "inherit" },
);
if (forge.status !== 0) process.exit(forge.status ?? 1);
const required = [
  "packages/contracts/src/MarketRegistry.sol",
  "packages/contracts/src/QuoteEscrow.sol",
  "packages/contracts/src/NectarExecutor.sol",
  "packages/contracts/src/MorphoBlueAdapter.sol",
  "packages/contracts/src/NectarPropAMM.sol",
  "packages/contracts/src/RiskGuard.sol",
  "packages/contracts/src/ExternalSwapAdapter.sol",
  "deployments/robinhood-testnet.json",
  "SECURITY.md",
  "KNOWN_LIMITATIONS.md",
  "THIRD_PARTY_NOTICES.md",
  "docs/THREAT_MODEL.md",
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`missing ${file}`);
    process.exit(1);
  }
}
if (fs.existsSync(path.join(root, "deployments/arbitrum-sepolia.json"))) {
  console.error("Refusing verify: arbitrum-sepolia.json exists but that network was not deployed.");
  process.exit(1);
}
console.log("verify ok");
