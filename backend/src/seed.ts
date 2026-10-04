#!/usr/bin/env node
/**
 * Seeds a demo borrower position, price shock, maker funding + quote, then waits for keeper execution.
 */
import { encodeAbiParameters, keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadNetworks, ANVIL_KEYS, type NetworkConfig } from "./config.js";
import { net, QUOTE_TYPES, quoteDomain, type QuoteTerms } from "./chain.js";
import {
  makerEscrowAbi,
  mockErc20Abi,
  mockLendingMarketAbi,
  mockOracleAbi,
  marketRegistryAbi,
  quoteRegistryAbi,
} from "./generated/abis.js";
import { indexOnce } from "./indexer.js";
import { log } from "./log.js";

const USD = 10n ** 6n;
const SHARE = 10n ** 18n;
const LLTV = 500000000000000000n; // 0.5e18

function px(usdPerShare: number) {
  return BigInt(usdPerShare) * 10n ** 24n;
}

async function seedNetwork(cfg: NetworkConfig) {
  const c = cfg.manifest.contracts;
  const { client, wallet } = net(cfg);
  const operatorKey = cfg.operatorKey ?? ANVIL_KEYS[0];
  const keeperKey = cfg.keeperKey ?? ANVIL_KEYS[1];
  const makerKey = cfg.makerKey ?? ANVIL_KEYS[2];
  const borrowerKey = ANVIL_KEYS[3];
  const lenderKey = operatorKey;

  const operator = privateKeyToAccount(operatorKey);
  const maker = privateKeyToAccount(makerKey);
  const borrower = privateKeyToAccount(borrowerKey);
  const lender = privateKeyToAccount(lenderKey);

  const marketKey = cfg.manifest.markets.mTSLA as Hex;
  const market = await client.readContract({
    address: c.MarketRegistry,
    abi: marketRegistryAbi,
    functionName: "getMarket",
    args: [marketKey],
  }) as { admitted: boolean; policyHash: Hex; policy: { params: { loanToken: Hex; collateralToken: Hex; oracle: Hex; lltv: bigint } } };

  if (!market.admitted) throw new Error("mTSLA market not admitted");

  const params = market.policy.params;
  const morphoId = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }],
      [params.loanToken, params.collateralToken, params.oracle, params.lltv],
    ),
  );

  const w = (pk: Hex) => wallet(pk);

  // Lender liquidity (if needed)
  const bal = await client.readContract({ address: c.DebtToken, abi: mockErc20Abi, functionName: "balanceOf", args: [lender.address] });
  if (bal < 500_000n * USD) {
    log.info(`[seed:${cfg.key}] minting debt to lender`);
    await w(operatorKey).writeContract({ address: c.DebtToken, abi: mockErc20Abi, functionName: "mint", args: [lender.address, 1_000_000n * USD] });
  }
  await w(lenderKey).writeContract({ address: c.DebtToken, abi: mockErc20Abi, functionName: "approve", args: [c.MockLendingMarket, 2n ** 256n - 1n] });
  await w(lenderKey).writeContract({
    address: c.MockLendingMarket,
    abi: mockLendingMarketAbi,
    functionName: "supply",
    args: [params, 500_000n * USD, lender.address],
  });

  // Borrower position
  await w(operatorKey).writeContract({ address: c.mTSLA, abi: mockErc20Abi, functionName: "mint", args: [borrower.address, 60n * SHARE] });
  await w(borrowerKey).writeContract({ address: c.mTSLA, abi: mockErc20Abi, functionName: "approve", args: [c.MockLendingMarket, 2n ** 256n - 1n] });
  const posBefore = await client.readContract({
    address: c.MockLendingMarket,
    abi: mockLendingMarketAbi,
    functionName: "position",
    args: [morphoId, borrower.address],
  }) as [bigint, bigint];
  if (posBefore[1] === 0n) {
    await w(operatorKey).writeContract({ address: c.mTSLAOracle, abi: mockOracleAbi, functionName: "setPrice", args: [px(400)] });
    if (posBefore[0] < 60n * SHARE) {
      await w(borrowerKey).writeContract({
        address: c.MockLendingMarket,
        abi: mockLendingMarketAbi,
        functionName: "supplyCollateral",
        args: [params, 60n * SHARE - posBefore[0], borrower.address],
      });
    }
    await w(borrowerKey).writeContract({
      address: c.MockLendingMarket,
      abi: mockLendingMarketAbi,
      functionName: "borrow",
      args: [params, 10_000n * USD, borrower.address],
    });
    log.info(`[seed:${cfg.key}] opened borrower position`);
  }

  // Price shock -> liquidatable
  await w(operatorKey).writeContract({ address: c.mTSLAOracle, abi: mockOracleAbi, functionName: "setPrice", args: [px(150)] });
  log.info(`[seed:${cfg.key}] oracle price dropped to $150/share (liquidatable)`);

  // Maker deposit
  await w(operatorKey).writeContract({ address: c.DebtToken, abi: mockErc20Abi, functionName: "mint", args: [maker.address, 25_000n * USD] });
  await w(makerKey).writeContract({ address: c.DebtToken, abi: mockErc20Abi, functionName: "approve", args: [c.MakerEscrow, 2n ** 256n - 1n] });
  await w(makerKey).writeContract({ address: c.MakerEscrow, abi: makerEscrowAbi, functionName: "deposit", args: [c.DebtToken, 20_000n * USD, maker.address] });

  const makerNonce = await client.readContract({ address: c.QuoteRegistry, abi: quoteRegistryAbi, functionName: "makerNonce", args: [maker.address] });
  const now = Number(await client.getBlock().then((b) => b.timestamp));
  const quoteNonce = BigInt(Date.now());
  const terms: QuoteTerms = {
    schemaVersion: 1,
    maker: maker.address,
    makerNonce,
    marketKey,
    adapterVersion: 1,
    borrower: borrower.address,
    collateralToken: params.collateralToken,
    collateralAmount: 50n * SHARE,
    debtToken: params.loanToken,
    cashOut: 10_140n * USD,
    maxDebtRepay: 10_000n * USD,
    collateralRecipient: maker.address,
    keeperCompensation: 50n * USD,
    protocolFee: 20n * USD,
    minNetSurplus: 70n * USD,
    keeperRecipient: "0x0000000000000000000000000000000000000000",
    surplusRecipient: operator.address,
    validUntil: BigInt(now + 120),
    policyHash: market.policyHash,
    quoteNonce,
  };

  const signature = await w(makerKey).signTypedData({
    domain: quoteDomain(cfg.chainId, c.QuoteRegistry),
    types: QUOTE_TYPES,
    primaryType: "Quote",
    message: terms,
  });

  const hash = await w(makerKey).writeContract({
    address: c.QuoteRegistry,
    abi: quoteRegistryAbi,
    functionName: "registerQuote",
    args: [terms, signature],
  });
  log.info(`[seed:${cfg.key}] quote registered tx ${hash}`);

  await indexOnce(cfg);
  log.info(`[seed:${cfg.key}] indexed; keeper ${privateKeyToAccount(keeperKey).address} should execute`);
}

async function main() {
  const target = process.argv[2];
  const networks = loadNetworks().filter((n) => !target || n.key === target);
  if (!networks.length) {
    console.error("No deployment manifests found. Run deploy first.");
    process.exit(1);
  }
  for (const n of networks) await seedNetwork(n);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
