#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  encodeDeployData,
  decodeEventLog,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const out = (file) => JSON.parse(readFileSync(path.join(root, "contracts/out", file), "utf8"));

const rpc = process.env.RPC_URL || "http://127.0.0.1:8545";
const chainId = Number(process.env.CHAIN_ID || "31337");
const pk = process.env.DEPLOYER_PRIVATE_KEY;
const keeperPk = process.env.KEEPER_PRIVATE_KEY;
const makerPk = process.env.MAKER_PRIVATE_KEY;
if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY required");

const account = privateKeyToAccount(pk);
const keeper = keeperPk ? privateKeyToAccount(keeperPk) : account;
const maker = makerPk ? privateKeyToAccount(makerPk) : account;
const transport = http(rpc);
const chain = {
  id: chainId,
  name: "nectar-target",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
};
const publicClient = createPublicClient({ chain, transport });
const wallet = createWalletClient({ account, chain, transport });

function artifact(rel) {
  const j = out(rel);
  return { abi: j.abi, bytecode: j.bytecode.object };
}

async function deploy(name, rel, args = []) {
  const { abi, bytecode } = artifact(rel);
  const data = encodeDeployData({ abi, bytecode, args });
  const hash = await wallet.sendTransaction({ data });
  const rec = await publicClient.waitForTransactionReceipt({ hash });
  if (rec.status !== "success") throw new Error(`deploy ${name} failed`);
  console.log(name, rec.contractAddress, rec.transactionHash);
  return { address: rec.contractAddress, abi, bytecode, tx: rec.transactionHash, block: rec.blockNumber };
}

async function write(address, abi, functionName, args) {
  await publicClient.simulateContract({ account: account.address, address, abi, functionName, args });
  const hash = await wallet.writeContract({ address, abi, functionName, args, account });
  const rec = await publicClient.waitForTransactionReceipt({ hash });
  if (rec.status !== "success") throw new Error(`${functionName} failed`);
  return rec;
}

const MockERC20 = artifact("MockERC20.sol/MockERC20.json");
const MockOracle = artifact("MockOracle.sol/MockOracle.json");
const MockSequencer = artifact("MockSequencer.sol/MockSequencer.json");
const MockMorpho = artifact("MockMorpho.sol/MockMorpho.json");
const MockAMM = artifact("MockAMM.sol/MockAMM.json");
const MarketRegistry = artifact("MarketRegistry.sol/MarketRegistry.json");
const QuoteEscrow = artifact("QuoteEscrow.sol/QuoteEscrow.json");
const RiskGuard = artifact("RiskGuard.sol/RiskGuard.json");
const NectarExecutor = artifact("NectarExecutor.sol/NectarExecutor.json");
const Adapter = artifact("MorphoBlueAdapter.sol/MorphoBlueAdapter.json");

const debt = await deploy("debt", "MockERC20.sol/MockERC20.json", ["Nectar Mock USDC", "nmUSDC", 6]);
const collat = await deploy("collateral", "MockERC20.sol/MockERC20.json", ["Nectar Mock Stock", "nmSTK", 18]);
// Price is debt-token base units per 1e18 collateral (nmUSDC 6 dp, nmSTK 18 dp).
const oracle = await deploy("oracle", "MockOracle.sol/MockOracle.json", [10n ** 6n, keccak256("0x6e6d53544b2f555344")]);
const sequencer = await deploy("sequencer", "MockSequencer.sol/MockSequencer.json", []);
const morpho = await deploy("morpho", "MockMorpho.sol/MockMorpho.json", []);
const amm = await deploy("amm", "MockAMM.sol/MockAMM.json", []);
const registry = await deploy("registry", "MarketRegistry.sol/MarketRegistry.json", [account.address, account.address, account.address, 3600n]);
const escrow = await deploy("escrow", "QuoteEscrow.sol/QuoteEscrow.json", [account.address, registry.address]);
const guard = await deploy("riskGuard", "RiskGuard.sol/RiskGuard.json", []);
const executor = await deploy("executor", "NectarExecutor.sol/NectarExecutor.json", [account.address, registry.address, escrow.address, guard.address]);
const adapter = await deploy("adapter", "MorphoBlueAdapter.sol/MorphoBlueAdapter.json", [executor.address, morpho.address, account.address]);

await write(escrow.address, QuoteEscrow.abi, "setExecutor", [executor.address]);
await write(executor.address, NectarExecutor.abi, "setKeeperAllowlistEnabled", [true]);
await write(executor.address, NectarExecutor.abi, "setKeeper", [keeper.address, true]);
await write(executor.address, NectarExecutor.abi, "setKeeper", [account.address, true]);

const createRec = await write(morpho.address, MockMorpho.abi, "createMarket", [
  debt.address,
  collat.address,
  oracle.address,
  8n * 10n ** 17n,
]);
let morphoMarketId;
for (const log of createRec.logs) {
  try {
    const ev = decodeEventLog({ abi: MockMorpho.abi, data: log.data, topics: log.topics });
    if (ev.eventName === "MarketCreated") morphoMarketId = ev.args.marketId;
  } catch {}
}
if (!morphoMarketId) throw new Error("no market id");

const marketKey = keccak256(
  encodeAbiParameters(parseAbiParameters("uint256, address, bytes32"), [BigInt(chainId), morpho.address, morphoMarketId]),
);
const policy = {
  version: 1n,
  hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  maxQuoteLifetime: 120n,
  minPriceFreshness: 7200n,
  sequencerGrace: 0n,
  protocolFeeRecipient: account.address,
  ammEnabled: true,
};
policy.hash = keccak256(
  encodeAbiParameters(
    parseAbiParameters("uint256, uint256, uint256, uint256, address, bool"),
    [policy.version, policy.maxQuoteLifetime, policy.minPriceFreshness, policy.sequencerGrace, policy.protocolFeeRecipient, policy.ammEnabled],
  ),
);

const market = {
  marketKey,
  chainId: BigInt(chainId),
  protocol: morpho.address,
  morphoMarketId,
  adapter: adapter.address,
  adapterVersion: 1n,
  debtToken: debt.address,
  collateralToken: collat.address,
  oracle: oracle.address,
  sequencer: sequencer.address,
  lltv: 8n * 10n ** 17n,
  admitted: true,
  mockLabeled: true,
};
await write(registry.address, MarketRegistry.abi, "admitMarket", [market, policy]);

const collateralAmt = 20_000n * 10n ** 18n;
const debtAmt = 10_000n * 10n ** 6n;
const borrower = maker.address;
await write(collat.address, MockERC20.abi, "mint", [account.address, collateralAmt]);
await write(collat.address, MockERC20.abi, "approve", [morpho.address, collateralAmt]);
await write(morpho.address, MockMorpho.abi, "seedPosition", [morphoMarketId, borrower, collateralAmt, debtAmt]);
await write(oracle.address, MockOracle.abi, "set", [5n * 10n ** 5n, BigInt(Math.floor(Date.now() / 1000) + 10), false]);
await write(debt.address, MockERC20.abi, "mint", [maker.address, 1_000_000n * 10n ** 6n]);
await write(debt.address, MockERC20.abi, "mint", [amm.address, 50_000n * 10n ** 6n]);
await write(amm.address, MockAMM.abi, "setQuote", [collat.address, collateralAmt, debt.address, 9_820n * 10n ** 6n]);

const commit = existsSync(path.join(root, ".git/HEAD"))
  ? readFileSync(path.join(root, ".git/HEAD"), "utf8").trim()
  : "unknown";

const manifest = {
  network: chainId === 421614 ? "arbitrum-sepolia" : chainId === 46630 ? "robinhood-testnet" : "anvil",
  chainId,
  status: chainId === 31337 ? "local" : "live",
  rpc,
  explorer: chainId === 421614 ? "https://sepolia.arbiscan.io" : undefined,
  compiler: { solc: "0.8.24", optimizer: true, runs: 200, viaIR: true },
  commit,
  deploymentBlock: Number(debt.block),
  keeperAllowlist: true,
  mockLabeled: true,
  marketKey,
  morphoMarketId,
  policyHash: policy.hash,
  borrower,
  addresses: {
    debtToken: debt.address,
    collateralToken: collat.address,
    oracle: oracle.address,
    sequencer: sequencer.address,
    morpho: morpho.address,
    amm: amm.address,
    registry: registry.address,
    escrow: escrow.address,
    riskGuard: guard.address,
    executor: executor.address,
    adapter: adapter.address,
  },
  roles: {
    deployer: account.address,
    keeper: keeper.address,
    maker: maker.address,
  },
  bytecodeHashes: {
    escrow: keccak256(escrow.bytecode),
    executor: keccak256(executor.bytecode),
    registry: keccak256(registry.bytecode),
    adapter: keccak256(adapter.bytecode),
  },
};

mkdirSync(path.join(root, "deployments"), { recursive: true });
const dest =
  chainId === 421614
    ? "deployments/arbitrum-sepolia.json"
    : chainId === 46630
      ? "deployments/robinhood-testnet.json"
      : "deployments/anvil.json";
writeFileSync(path.join(root, dest), JSON.stringify(manifest, null, 2));
console.log("wrote", dest);
console.log(JSON.stringify({ marketKey, morphoMarketId, policyHash: policy.hash, borrower }, null, 2));
