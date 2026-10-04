#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, keccak256, encodeAbiParameters, parseAbiParameters, maxUint256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chainId = Number(process.env.CHAIN_ID || "31337");
const file =
  chainId === 421614
    ? "deployments/arbitrum-sepolia.json"
    : chainId === 46630
      ? "deployments/robinhood-testnet.json"
      : "deployments/anvil.json";
const d = JSON.parse(readFileSync(path.join(root, file), "utf8"));
const escrowAbi = JSON.parse(readFileSync(path.join(root, "contracts/out/QuoteEscrow.sol/QuoteEscrow.json"), "utf8")).abi;
const execAbi = JSON.parse(readFileSync(path.join(root, "contracts/out/NectarExecutor.sol/NectarExecutor.json"), "utf8")).abi;
const erc20Abi = JSON.parse(readFileSync(path.join(root, "contracts/out/MockERC20.sol/MockERC20.json"), "utf8")).abi;

const maker = privateKeyToAccount(process.env.MAKER_PRIVATE_KEY);
const keeper = privateKeyToAccount(process.env.KEEPER_PRIVATE_KEY);
const rpc = process.env.RPC_URL || d.rpc;
const transport = http(rpc);
const chain = {
  id: chainId,
  name: "nectar-target",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
};
const publicClient = createPublicClient({ chain, transport });
const makerWallet = createWalletClient({ account: maker, chain, transport });
const keeperWallet = createWalletClient({ account: keeper, chain, transport });

const oracleAbi = JSON.parse(readFileSync(path.join(root, "contracts/out/MockOracle.sol/MockOracle.json"), "utf8")).abi;
const block = await publicClient.getBlock();
await publicClient.waitForTransactionReceipt({
  hash: await createWalletClient({
    account: privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY),
    chain,
    transport,
  }).writeContract({
    address: d.addresses.oracle,
    abi: oracleAbi,
    functionName: "set",
    args: [5n * 10n ** 5n, block.timestamp, false],
    account: privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY),
  }),
});

const cashOut = 10_140n * 10n ** 6n;
await publicClient.simulateContract({
  account: maker.address,
  address: d.addresses.debtToken,
  abi: erc20Abi,
  functionName: "approve",
  args: [d.addresses.escrow, maxUint256],
});
await publicClient.waitForTransactionReceipt({
  hash: await makerWallet.writeContract({
    address: d.addresses.debtToken,
    abi: erc20Abi,
    functionName: "approve",
    args: [d.addresses.escrow, maxUint256],
    account: maker,
  }),
});
await publicClient.simulateContract({
  account: maker.address,
  address: d.addresses.escrow,
  abi: escrowAbi,
  functionName: "deposit",
  args: [d.addresses.debtToken, cashOut, maker.address],
});
const depHash = await makerWallet.writeContract({
  address: d.addresses.escrow,
  abi: escrowAbi,
  functionName: "deposit",
  args: [d.addresses.debtToken, cashOut, maker.address],
  account: maker,
});
await publicClient.waitForTransactionReceipt({ hash: depHash });
console.log("deposited", depHash);

const nonce = await publicClient.readContract({
  address: d.addresses.escrow,
  abi: escrowAbi,
  functionName: "makerNonces",
  args: [maker.address],
});
const validUntil = BigInt(Math.floor(Date.now() / 1000) + 110);
const reservationId = keccak256(encodeAbiParameters(parseAbiParameters("address, uint256, uint256"), [maker.address, nonce, validUntil]));
const positionKey = keccak256(encodeAbiParameters(parseAbiParameters("bytes32, address"), [d.marketKey, d.borrower]));
const quote = {
  schemaVersion: 1n,
  chainId: BigInt(chainId),
  verifyingContract: d.addresses.escrow,
  maker: maker.address,
  makerNonce: nonce,
  marketKey: d.marketKey,
  adapterVersion: 1n,
  borrower: d.borrower,
  positionKey,
  collateralToken: d.addresses.collateralToken,
  collateralAmount: 20_000n * 10n ** 18n,
  debtToken: d.addresses.debtToken,
  cashOut,
  maxDebtRepay: 10_000n * 10n ** 6n,
  collateralRecipient: maker.address,
  keeperCompensation: 50n * 10n ** 6n,
  protocolFee: 20n * 10n ** 6n,
  minNetSurplus: 70n * 10n ** 6n,
  keeperRecipient: keeper.address,
  surplusRecipient: maker.address,
  validUntil,
  reservationId,
  policyHash: d.policyHash,
  quoteNonce: BigInt(Date.now()),
};

const signature = await makerWallet.signTypedData({
  account: maker,
  domain: { name: "Nectar", version: "1", chainId, verifyingContract: d.addresses.escrow },
  types: {
    Quote: [
      { name: "schemaVersion", type: "uint256" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
      { name: "maker", type: "address" },
      { name: "makerNonce", type: "uint256" },
      { name: "marketKey", type: "bytes32" },
      { name: "adapterVersion", type: "uint256" },
      { name: "borrower", type: "address" },
      { name: "positionKey", type: "bytes32" },
      { name: "collateralToken", type: "address" },
      { name: "collateralAmount", type: "uint256" },
      { name: "debtToken", type: "address" },
      { name: "cashOut", type: "uint256" },
      { name: "maxDebtRepay", type: "uint256" },
      { name: "collateralRecipient", type: "address" },
      { name: "keeperCompensation", type: "uint256" },
      { name: "protocolFee", type: "uint256" },
      { name: "minNetSurplus", type: "uint256" },
      { name: "keeperRecipient", type: "address" },
      { name: "surplusRecipient", type: "address" },
      { name: "validUntil", type: "uint256" },
      { name: "reservationId", type: "bytes32" },
      { name: "policyHash", type: "bytes32" },
      { name: "quoteNonce", type: "uint256" },
    ],
  },
  primaryType: "Quote",
  message: quote,
});

await publicClient.simulateContract({
  account: maker.address,
  address: d.addresses.escrow,
  abi: escrowAbi,
  functionName: "registerQuote",
  args: [quote, signature],
});
const regHash = await makerWallet.writeContract({
  address: d.addresses.escrow,
  abi: escrowAbi,
  functionName: "registerQuote",
  args: [quote, signature],
  account: maker,
});
const regRec = await publicClient.waitForTransactionReceipt({ hash: regHash });
console.log("registered", regHash);

const quoteTypehash = keccak256(
  "Quote(uint256 schemaVersion,uint256 chainId,address verifyingContract,address maker,uint256 makerNonce,bytes32 marketKey,uint256 adapterVersion,address borrower,bytes32 positionKey,address collateralToken,uint256 collateralAmount,address debtToken,uint256 cashOut,uint256 maxDebtRepay,address collateralRecipient,uint256 keeperCompensation,uint256 protocolFee,uint256 minNetSurplus,address keeperRecipient,address surplusRecipient,uint256 validUntil,bytes32 reservationId,bytes32 policyHash,uint256 quoteNonce)",
);
const structHash = keccak256(
  encodeAbiParameters(
    parseAbiParameters(
      "bytes32, uint256, uint256, address, address, uint256, bytes32, uint256, address, bytes32, address, uint256, address, uint256, uint256, address, uint256, uint256, uint256, address, address, uint256, bytes32, bytes32, uint256",
    ),
    [
      quoteTypehash,
      quote.schemaVersion,
      quote.chainId,
      quote.verifyingContract,
      quote.maker,
      quote.makerNonce,
      quote.marketKey,
      quote.adapterVersion,
      quote.borrower,
      quote.positionKey,
      quote.collateralToken,
      quote.collateralAmount,
      quote.debtToken,
      quote.cashOut,
      quote.maxDebtRepay,
      quote.collateralRecipient,
      quote.keeperCompensation,
      quote.protocolFee,
      quote.minNetSurplus,
      quote.keeperRecipient,
      quote.surplusRecipient,
      quote.validUntil,
      quote.reservationId,
      quote.policyHash,
      quote.quoteNonce,
    ],
  ),
);

const job = {
  marketKey: d.marketKey,
  borrower: d.borrower,
  seizedCollateral: quote.collateralAmount,
  maxDebtRepay: quote.maxDebtRepay,
  quoteId: structHash,
  deadline: quote.validUntil,
  keeper: keeper.address,
};
const route = { kind: 0, amm: d.addresses.amm, minOut: 0n };
const preview = await publicClient.readContract({
  address: d.addresses.executor,
  abi: execAbi,
  functionName: "previewJob",
  args: [job, quote, route],
});
console.log("preview", preview);

mkdirSync(path.join(root, "data"), { recursive: true });
const ser = Object.fromEntries(Object.entries(quote).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]));
writeFileSync(
  path.join(root, "data/active-quote.json"),
  JSON.stringify({ quote: ser, quoteId: structHash, filled: false }, null, 2),
);

if (process.env.SEED_SKIP_EXECUTE === "1") {
  writeFileSync(
    path.join(root, "deployments/local-e2e.json"),
    JSON.stringify({ chainId, depositTx: depHash, registerTx: regHash, quoteId: structHash, status: "quote_active" }, null, 2),
  );
  console.log("seed complete (execute skipped)");
  process.exit(0);
}

await publicClient.simulateContract({
  account: keeper.address,
  address: d.addresses.executor,
  abi: execAbi,
  functionName: "executeJob",
  args: [job, quote, route],
});
const execHash = await keeperWallet.writeContract({
  address: d.addresses.executor,
  abi: execAbi,
  functionName: "executeJob",
  args: [job, quote, route],
  account: keeper,
});
const execRec = await publicClient.waitForTransactionReceipt({ hash: execHash });
console.log("executed", execHash, execRec.status);

writeFileSync(
  path.join(root, "data/active-quote.json"),
  JSON.stringify({ quote: ser, quoteId: structHash, filled: true }, null, 2),
);
writeFileSync(
  path.join(root, "deployments/local-e2e.json"),
  JSON.stringify(
    {
      chainId,
      depositTx: depHash,
      registerTx: regHash,
      executeTx: execHash,
      executeBlock: execRec.blockNumber.toString(),
      quoteId: structHash,
      status: execRec.status,
    },
    null,
    2,
  ),
);
console.log("e2e complete");
