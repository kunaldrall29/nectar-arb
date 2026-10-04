import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, encodePacked } from "viem";

const broadcastPath = process.argv[2];
const raw = JSON.parse(readFileSync(broadcastPath, "utf8"));
const tx = raw.transactions.find((t) => t.contractName === "QuoteEscrow");
const blockNumber = tx?.blockNumber ?? raw.receipts?.[0]?.blockNumber ?? 0;

const byName = {};
for (const t of raw.transactions) {
  if (t.contractName && t.contractAddress) {
    byName[t.contractName] = t.contractAddress;
  }
}

const marketLog = raw.transactions.find((t) => t.contractName === "MarketRegistry");
const chainId = raw.chain ?? 421614;

const tokens = raw.transactions.filter((t) => t.contractName === "MockERC20");
const manifest = {
  chainId,
  network: "arbitrum-sepolia",
  blockNumber,
  marketKey: keccak256(encodePacked(["string", "uint256"], ["nectar-demo", BigInt(chainId)])),
  contracts: {
    DebtToken: tokens[0]?.contractAddress,
    CollateralToken: tokens[1]?.contractAddress ?? tokens[0]?.contractAddress,
    Oracle: byName.MockOracle,
    LendingMarket: byName.MockLendingMarket,
    MarketRegistry: byName.MarketRegistry,
    RiskGuard: byName.RiskGuard,
    QuoteEscrow: byName.QuoteEscrow,
    NectarExecutor: byName.NectarExecutor,
    MorphoAdapter: byName.MorphoAdapter,
  },
  commit: process.env.GIT_COMMIT ?? "local",
  label: "Testnet mock lending (PX05); Morpho Blue production adapter deferred",
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
writeFileSync(resolve(root, "deployments/arbitrum-sepolia.json"), JSON.stringify(manifest, null, 2));
console.log("Wrote deployments/arbitrum-sepolia.json");
