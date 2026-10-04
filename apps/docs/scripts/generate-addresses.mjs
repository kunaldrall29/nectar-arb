import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const robinhood = JSON.parse(fs.readFileSync(path.join(root, "deployments/robinhood-testnet.json"), "utf8"));
const localPath = path.join(root, "deployments/protocol-local.json");
const local = fs.existsSync(localPath) ? JSON.parse(fs.readFileSync(localPath, "utf8")) : null;
const sepolia = fs.existsSync(path.join(root, "deployments/arbitrum-sepolia.json"));

const lines = [
  "---",
  "title: Addresses",
  "---",
  "",
  "Generated from deployment manifests. Sepolia addresses are omitted unless `deployments/arbitrum-sepolia.json` exists.",
  "",
  "## Arbitrum Sepolia (421614)",
  "",
  sepolia ? "A manifest is present." : "Not deployed. The deployer balance check is recorded as still zero when that is the result. No addresses are listed.",
  "",
  "## Robinhood Chain testnet rehearsal (46630)",
  "",
  "This table is the earlier rehearsal bytecode. It is not the protocol module set in `packages/contracts`.",
  "",
  "| Contract | Address |",
  "| --- | --- |",
  `| Escrow | \`${robinhood.escrow}\` |`,
  `| Quotes | \`${robinhood.quotes}\` |`,
  `| Executor | \`${robinhood.executor}\` |`,
  `| Market | \`${robinhood.rehearsalMarket}\` |`,
  `| Pause guardian | \`${robinhood.pauseGuardian}\` |`,
  `| nUSD | \`${robinhood.debtToken}\` |`,
  `| nSTK | \`${robinhood.collateralToken}\` |`,
  "",
  `Liquidation transaction \`${robinhood.transactions.at(-1).hash}\`.`,
  "",
  "Official Paxos USDG on this chain, for reads: `0x7E955252E15c84f5768B83c41a71F9eba181802F`.",
  "",
  "## Local protocol manifest",
  "",
];
if (!local) {
  lines.push("No `deployments/protocol-local.json` yet. Run `pnpm local:bootstrap`.");
} else {
  lines.push("Local Anvil only. Nectar Sandbox Morpho is not an official Morpho deployment.", "");
  lines.push("| Module | Address |", "| --- | --- |");
  for (const key of ["marketRegistry", "quoteEscrow", "executor", "adapter", "sandboxMorpho", "propPool", "riskGuard", "swapAdapter"]) {
    lines.push(`| ${key} | \`${local[key]}\` |`);
  }
}
fs.mkdirSync(path.join(root, "apps/docs/docs/releases"), { recursive: true });
fs.writeFileSync(path.join(root, "apps/docs/docs/releases/addresses.md"), lines.join("\n") + "\n");
