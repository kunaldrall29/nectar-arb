import fs from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, http, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  executorAbi,
  morphoAbi,
  poolAbi,
  quoteDomain,
  quoteEscrowAbi,
  quoteTypes,
} from "../packages/sdk/src/index.ts";
import { openStore, recordJob, submitOrRecover } from "../packages/worker/src/recover.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
function flag(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
const network = flag("--network") ?? process.env.NETWORK ?? "local";
const scenario = flag("--scenario") ?? process.env.SCENARIO;
if (network !== "local") {
  console.error(`scenario:run supports network local in this session. Got ${network}.`);
  process.exit(1);
}
if (scenario !== "funded-quote" && scenario !== "propamm") {
  console.error("Pass --scenario funded-quote or --scenario propamm");
  process.exit(1);
}

const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const manifest = JSON.parse(fs.readFileSync(path.join(root, "deployments/protocol-local.json"), "utf8"));
if (manifest.chainId !== 31337 || manifest.protocol !== "evm-v1") {
  throw new Error("protocol-local.json is not a local evm-v1 manifest");
}
const chain = {
  id: 31337,
  name: "Local Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
};
const publicClient = createPublicClient({ chain, transport: http(rpc) });
const onchainId = await publicClient.getChainId();
if (onchainId !== 31337) throw new Error(`Refusing scenario on chain ${onchainId}`);

const makerKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const keeperKey = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const maker = privateKeyToAccount(makerKey);
const keeper = privateKeyToAccount(keeperKey);
if (getAddress(maker.address) !== getAddress(manifest.maker)) throw new Error("maker key does not match manifest");
if (getAddress(keeper.address) !== getAddress(manifest.keeper)) throw new Error("keeper key does not match manifest");

const makerWallet = createWalletClient({ account: maker, chain, transport: http(rpc) });
const keeperWallet = createWalletClient({ account: keeper, chain, transport: http(rpc) });
const db = openStore(path.join(root, "api/data/nectar.db"));
const marketParams = {
  loanToken: manifest.debtToken,
  collateralToken: manifest.collateralToken,
  oracle: manifest.oracle,
  irm: "0x0000000000000000000000000000000000000000",
  lltv: BigInt(manifest.lltv),
};

const borrower = scenario === "funded-quote" ? manifest.quoteBorrower : manifest.propBorrower;
const [seized, repaid, unhealthy] = await publicClient.readContract({
  address: manifest.sandboxMorpho,
  abi: morphoAbi,
  functionName: "previewLiquidate",
  args: [marketParams, borrower, 10000n],
});
if (!unhealthy || repaid !== 10000n) {
  throw new Error(`Borrower ${borrower} is not liquidatable for 10000 debt (unhealthy=${unhealthy}, repaid=${repaid})`);
}

const block = await publicClient.getBlock();
const now = block.timestamp;
const jobBase = {
  marketId: manifest.marketId,
  borrower,
  repayAssets: 10000n,
  pool: manifest.propPool,
  swapAdapter: manifest.swapAdapter,
  keeperRecipient: keeper.address,
  keeperCompensation: 50n,
  protocolFee: 20n,
  surplusRecipient: manifest.surplusRecipient,
  deadline: now + 90n,
};

let receipt;
if (scenario === "funded-quote") {
  const reservationId = 1n;
  const quote = {
    schemaVersion: 1,
    maker: maker.address,
    makerNonce: reservationId,
    marketKey: manifest.marketId,
    adapterVersion: 1,
    borrower,
    collateralToken: manifest.collateralToken,
    collateralAmount: seized,
    debtToken: manifest.debtToken,
    cashOut: 10140n,
    maxDebtRepay: 10000n,
    collateralRecipient: maker.address,
    keeperCompensation: 50n,
    protocolFee: 20n,
    minNetSurplus: 70n,
    keeperRecipient: keeper.address,
    surplusRecipient: manifest.surplusRecipient,
    validUntil: now + 30n,
    reservationId,
    policyHash: manifest.policyId,
    quoteNonce: reservationId,
  };
  const signature = await maker.signTypedData({
    domain: quoteDomain(31337, manifest.quoteEscrow),
    types: quoteTypes,
    primaryType: "Quote",
    message: quote,
  });
  const registerHash = await makerWallet.writeContract({
    address: manifest.quoteEscrow,
    abi: quoteEscrowAbi,
    functionName: "registerQuote",
    args: [quote, signature],
  });
  await publicClient.waitForTransactionReceipt({ hash: registerHash });
  const first = await submitOrRecover({
    publicClient,
    walletClient: keeperWallet,
    db,
    key: `inflight:${scenario}:${reservationId.toString()}`,
    request: {
      address: manifest.executor,
      abi: executorAbi,
      functionName: "execute",
      args: [{ ...jobBase, route: 1, reservationId, minSaleOut: 0n }],
    },
  });
  const nonceBefore = await publicClient.getTransactionCount({ address: keeper.address });
  const second = await submitOrRecover({
    publicClient,
    walletClient: keeperWallet,
    db,
    key: `inflight:${scenario}:${reservationId.toString()}`,
    request: {
      address: manifest.executor,
      abi: executorAbi,
      functionName: "execute",
      args: [{ ...jobBase, route: 1, reservationId, minSaleOut: 0n }],
    },
  });
  const nonceAfter = await publicClient.getTransactionCount({ address: keeper.address });
  if (!second.recovered) throw new Error("In-flight job was submitted twice");
  if (nonceAfter !== nonceBefore) throw new Error("Recovery changed the keeper nonce");
  receipt = {
    scenario,
    recovered: true,
    registerTx: registerHash,
    txHash: first.hash,
    blockNumber: first.receipt.blockNumber.toString(),
    status: first.receipt.status,
    debtRepaid: "10000",
    cashOut: "10140",
    keeperCompensation: "50",
    protocolFee: "20",
    surplus: "70",
    collateralAmount: seized.toString(),
    borrower,
    route: "1",
  };
} else {
  const [bid, ok] = await publicClient.readContract({
    address: manifest.propPool,
    abi: poolAbi,
    functionName: "previewBid",
    args: [seized],
  });
  if (!ok || bid < 10070n) throw new Error(`PropAMM bid ${bid} is not live for seized ${seized}`);
  const sent = await submitOrRecover({
    publicClient,
    walletClient: keeperWallet,
    db,
    key: `inflight:${scenario}:${borrower}`,
    request: {
      address: manifest.executor,
      abi: executorAbi,
      functionName: "execute",
      args: [{ ...jobBase, route: 2, reservationId: 0n, minSaleOut: 10000n }],
    },
  });
  recordJob(db, {
    id: `scenario:${scenario}`,
    kind: scenario,
    status: "confirmed",
    txHash: sent.hash,
    detail: { bid: bid.toString(), seized: seized.toString() },
  });
  receipt = {
    scenario,
    recovered: sent.recovered,
    txHash: sent.hash,
    blockNumber: sent.receipt.blockNumber.toString(),
    status: sent.receipt.status,
    debtRepaid: "10000",
    propBid: bid.toString(),
    collateralAmount: seized.toString(),
    keeperCompensation: "50",
    protocolFee: "20",
    borrower,
    route: "2",
  };
}

if (receipt.status !== "success") throw new Error(`${scenario} reverted`);
const dir = path.join(root, "deployments/receipts");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${scenario}.json`);
fs.writeFileSync(file, JSON.stringify(receipt, null, 2));
const apiDir = path.join(root, "api/data/receipts");
fs.mkdirSync(apiDir, { recursive: true });
fs.writeFileSync(path.join(apiDir, `${scenario}.json`), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt, null, 2));
