import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  keccak256,
  encodePacked,
  stringToHex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rpc = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "http://127.0.0.1:8545";
const pk = (process.env.DEPLOYER_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as `0x${string}`;

const account = privateKeyToAccount(pk);
const chain = { ...arbitrumSepolia, rpcUrls: { default: { http: [rpc] } } };
const publicClient = createPublicClient({ chain, transport: http(rpc) });
const wallet = createWalletClient({ account, chain, transport: http(rpc) });

const erc20Abi = [
  { type: "function", name: "mint", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "approve", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
] as const;

const escrowAbi = [
  {
    type: "function",
    name: "deposit",
    inputs: [{ type: "address" }, { type: "uint256" }, { type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "registerQuote",
    inputs: [
      {
        name: "quote",
        type: "tuple",
        components: [
          { name: "schemaVersion", type: "uint256" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
          { name: "maker", type: "address" },
          { name: "makerNonce", type: "uint256" },
          { name: "marketKey", type: "bytes32" },
          { name: "adapterVersion", type: "uint256" },
          { name: "borrower", type: "address" },
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
          { name: "quoteNonce", type: "bytes32" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ type: "bytes32" }],
    stateMutability: "nonpayable",
  },
] as const;

const executorAbi = [
  {
    type: "function",
    name: "executeJob",
    inputs: [
      {
        name: "route",
        type: "tuple",
        components: [
          { name: "marketKey", type: "bytes32" },
          { name: "borrower", type: "address" },
          { name: "collateralAmount", type: "uint256" },
          { name: "maxDebtRepay", type: "uint256" },
          { name: "reservationId", type: "bytes32" },
          { name: "deadline", type: "uint256" },
          { name: "collateralRecipient", type: "address" },
          { name: "keeperCompensation", type: "uint256" },
          { name: "protocolFee", type: "uint256" },
          { name: "keeperRecipient", type: "address" },
          { name: "surplusRecipient", type: "address" },
          { name: "minNetSurplus", type: "uint256" },
        ],
      },
    ],
    outputs: [{ type: "bytes32" }],
    stateMutability: "nonpayable",
  },
] as const;

function run(cmd: string) {
  console.log(cmd);
  execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, DEPLOYER_PRIVATE_KEY: pk, ARBITRUM_SEPOLIA_RPC_URL: rpc } });
}

async function main() {
  if (rpc.includes("127.0.0.1") || rpc.includes("localhost")) {
    await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "anvil_setBalance",
        params: [account.address, "0x3635C9ADC5DEA00000"],
      }),
    });
  }

  run("bash scripts/deploy-testnet.sh");

  const manifestPath = resolve(root, "deployments/arbitrum-sepolia.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const marketKey = manifest.marketKey as `0x${string}`;

  const debt = manifest.contracts.DebtToken as Address;
  const collateral = manifest.contracts.CollateralToken as Address;
  const escrow = manifest.contracts.QuoteEscrow as Address;
  const lending = manifest.contracts.LendingMarket as Address;
  const executor = manifest.contracts.NectarExecutor as Address;

  const borrowerPk = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
  const borrower = privateKeyToAccount(borrowerPk);
  const borrowerWallet = createWalletClient({ account: borrower, chain, transport: http(rpc) });

  const openAbi = [
    {
      type: "function",
      name: "openPosition",
      inputs: [
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      outputs: [],
      stateMutability: "nonpayable",
    },
  ] as const;

  await borrowerWallet.writeContract({ address: debt, abi: erc20Abi, functionName: "mint", args: [borrower.address, parseUnits("100000", 6)] });
  await borrowerWallet.writeContract({ address: collateral, abi: erc20Abi, functionName: "mint", args: [borrower.address, parseUnits("10", 18)] });
  await borrowerWallet.writeContract({ address: collateral, abi: erc20Abi, functionName: "approve", args: [lending, parseUnits("10", 18)] });
  await borrowerWallet.writeContract({ address: debt, abi: erc20Abi, functionName: "approve", args: [lending, parseUnits("100000", 6)] });
  await borrowerWallet.writeContract({
    address: lending,
    abi: openAbi,
    functionName: "openPosition",
    args: [borrower.address, collateral, debt, parseUnits("10", 18), parseUnits("10000", 6)],
  });

  const cashOut = parseUnits("10140", 6);
  await wallet.writeContract({ address: debt, abi: erc20Abi, functionName: "mint", args: [account.address, cashOut] });
  await wallet.writeContract({ address: debt, abi: erc20Abi, functionName: "approve", args: [escrow, cashOut] });
  await wallet.writeContract({ address: escrow, abi: escrowAbi, functionName: "deposit", args: [debt, cashOut, account.address] });

  const reservationId = keccak256(stringToHex("e2e-reservation"));
  const block = await publicClient.getBlock();
  const validUntil = block.timestamp + 120n;
  const quote = {
    schemaVersion: 1n,
    chainId: BigInt(manifest.chainId),
    verifyingContract: escrow,
    maker: account.address,
    makerNonce: 0n,
    marketKey,
    adapterVersion: 1n,
    borrower: borrower.address,
    collateralToken: collateral,
    collateralAmount: parseUnits("1", 18),
    debtToken: debt,
    cashOut,
    maxDebtRepay: parseUnits("10000", 6),
    collateralRecipient: account.address,
    keeperCompensation: parseUnits("50", 6),
    protocolFee: parseUnits("20", 6),
    minNetSurplus: parseUnits("70", 6),
    keeperRecipient: account.address,
    surplusRecipient: account.address,
    validUntil,
    reservationId,
    policyHash: keccak256(stringToHex("policy-v1-testnet")),
    quoteNonce: keccak256(stringToHex("e2e-quote")),
  };

  const signature = await wallet.signTypedData({
    account,
    domain: { name: "NectarQuoteEscrow", version: "1", chainId: manifest.chainId, verifyingContract: escrow },
    types: {
      FundedQuote: [
        { name: "schemaVersion", type: "uint256" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
        { name: "maker", type: "address" },
        { name: "makerNonce", type: "uint256" },
        { name: "marketKey", type: "bytes32" },
        { name: "adapterVersion", type: "uint256" },
        { name: "borrower", type: "address" },
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
        { name: "quoteNonce", type: "bytes32" },
      ],
    },
    primaryType: "FundedQuote",
    message: quote,
  });

  await wallet.writeContract({ address: escrow, abi: escrowAbi, functionName: "registerQuote", args: [quote, signature] });

  const hash = await wallet.writeContract({
    address: executor,
    abi: executorAbi,
    functionName: "executeJob",
    args: [
      {
        marketKey,
        borrower: borrower.address,
        collateralAmount: parseUnits("1", 18),
        maxDebtRepay: parseUnits("10000", 6),
        reservationId,
        deadline: validUntil + 60n,
        collateralRecipient: account.address,
        keeperCompensation: parseUnits("50", 6),
        protocolFee: parseUnits("20", 6),
        keeperRecipient: account.address,
        surplusRecipient: account.address,
        minNetSurplus: parseUnits("70", 6),
      },
    ],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  manifest.e2eTxHash = hash;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log("E2E complete:", hash);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
