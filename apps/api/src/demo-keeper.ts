/**
 * End-to-end keeper rehearsal: register fixture quote + execute job on local Anvil.
 */
import { createWalletClient, createPublicClient, http, parseUnits, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { quoteEscrowAbi } from "@nectar/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, "../../../deployments/manifest.json"), "utf8"));
const net = manifest.networks.find((n: { status: string }) => n.status === "active");
const contracts = net.contracts as Record<string, Address>;

const makerKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const keeperKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const rpc = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "http://127.0.0.1:8545";

const accountMaker = privateKeyToAccount(makerKey);
const accountKeeper = privateKeyToAccount(keeperKey);

const publicClient = createPublicClient({ transport: http(rpc) });
const makerClient = createWalletClient({ account: accountMaker, transport: http(rpc) });
const keeperClient = createWalletClient({ account: accountKeeper, transport: http(rpc) });

const executorAbi = [
  {
    type: "function",
    name: "executeJob",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "job",
        type: "tuple",
        components: [
          { name: "marketKey", type: "bytes32" },
          { name: "positionKey", type: "bytes32" },
          { name: "reservationId", type: "uint256" },
          { name: "collateralAmount", type: "uint256" },
          { name: "debtRepay", type: "uint256" },
          { name: "routeType", type: "uint8" },
          { name: "adapter", type: "address" },
        ],
      },
      {
        name: "quote",
        type: "tuple",
        components: [
          { name: "schemaVersion", type: "uint8" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
          { name: "maker", type: "address" },
          { name: "makerNonce", type: "uint256" },
          { name: "marketKey", type: "bytes32" },
          { name: "adapterVersion", type: "uint8" },
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
          { name: "validUntil", type: "uint64" },
          { name: "reservationId", type: "uint256" },
          { name: "policyHash", type: "bytes32" },
          { name: "quoteNonce", type: "uint256" },
        ],
      },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

async function main() {
  const debt = contracts.debtToken;
  const escrow = contracts.quoteEscrow;
  const adapter = contracts.demoAdapter;
  const marketKey = net.marketKey as `0x${string}`;
  const reservationId = BigInt(Date.now());
  const amount = parseUnits("20000", 6);
  const cashOut = parseUnits("10140", 6);

  const erc20 = [
    { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
    { name: "mint", type: "function", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  ] as const;

  const w = { chain: null as null };
  await makerClient.writeContract({ ...w, address: debt, abi: erc20, functionName: "mint", args: [accountMaker.address, amount] });
  await makerClient.writeContract({ ...w, address: debt, abi: erc20, functionName: "approve", args: [escrow, amount] });
  await makerClient.writeContract({ ...w, address: escrow, abi: quoteEscrowAbi, functionName: "deposit", args: [debt, amount, accountMaker.address] });

  const chainId = BigInt(net.chainId);
  const validUntil = BigInt(Math.floor(Date.now() / 1000) + 120);
  const quote = {
    schemaVersion: 1,
    chainId,
    verifyingContract: escrow,
    maker: accountMaker.address,
    makerNonce: 0n,
    marketKey,
    adapterVersion: 1,
    positionKey: "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
    collateralToken: contracts.collateralToken,
    collateralAmount: parseUnits("100", 6),
    debtToken: debt,
    cashOut,
    maxDebtRepay: parseUnits("10500", 6),
    collateralRecipient: accountMaker.address,
    keeperCompensation: parseUnits("50", 6),
    protocolFee: parseUnits("20", 6),
    minNetSurplus: parseUnits("70", 6),
    keeperRecipient: accountKeeper.address,
    surplusRecipient: accountMaker.address,
    validUntil,
    reservationId,
    policyHash: "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
    quoteNonce: reservationId,
  };

  const digest = await publicClient.readContract({ address: escrow, abi: quoteEscrowAbi, functionName: "hashQuote", args: [quote] });
  const signature = await accountMaker.sign({ hash: digest });

  await makerClient.writeContract({ ...w, address: escrow, abi: quoteEscrowAbi, functionName: "registerQuote", args: [quote, signature] });

  const job = {
    marketKey,
    positionKey: quote.positionKey,
    reservationId,
    collateralAmount: quote.collateralAmount,
    debtRepay: parseUnits("10000", 6),
    routeType: 0,
    adapter,
  };

  const hash = await keeperClient.writeContract({
    ...w,
    address: contracts.nectarExecutor,
    abi: executorAbi,
    functionName: "executeJob",
    args: [job, quote],
  });

  console.log(JSON.stringify({ ok: true, txHash: hash, reservationId: reservationId.toString() }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
