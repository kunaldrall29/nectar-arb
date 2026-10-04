import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  getAddress,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { EIP712_NAME, EIP712_VERSION, KEEPER_FEE, MIN_SURPLUS, PROTOCOL_FEE, quoteTypes } from "../../shared/quote.ts";
import { formatUnits, parseUnits } from "../../shared/units.ts";
import {
  clearJobs,
  clearLogs,
  createJob,
  getJob,
  insertLog,
  listLogs,
  metaGet,
  metaSet,
  publicJob,
  updateJob,
  type DB,
} from "./db.ts";

const DEMO_MAKER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const DEMO_KEEPER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

export type Manifest = {
  chainId: number;
  escrow: Address;
  quotes: Address;
  executor: Address;
  rehearsalMarket: Address;
  debtToken: Address;
  collateralToken: Address;
  pauseGuardian: Address;
  debtDecimals: number;
  collateralDecimals: number;
  debtSymbol: string;
  collateralSymbol: string;
  openBorrower: Address;
  seededBorrower: Address;
  demoMaker: Address;
  deployer: Address;
  guardian: Address;
  oracle: Address;
  protocolFeeRecipient: Address;
  startBlock: number;
  scope: string;
  audited: boolean;
  label: string;
  commit?: string;
  networkName?: string;
};

type QuoteMessage = {
  schemaVersion: number;
  maker: Address;
  makerNonce: bigint;
  marketKey: Hex;
  adapterVersion: number;
  borrower: Address;
  collateralToken: Address;
  collateralAmount: bigint;
  debtToken: Address;
  cashOut: bigint;
  maxDebtRepay: bigint;
  collateralRecipient: Address;
  keeperCompensation: bigint;
  protocolFee: bigint;
  minNetSurplus: bigint;
  keeperRecipient: Address;
  surplusRecipient: Address;
  validUntil: bigint;
  reservationId: bigint;
  policyHash: Hex;
  quoteNonce: bigint;
};

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function loadAbi(name: string): Abi {
  const file = path.join(repoRoot(), "shared/abi", `${name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as Abi;
}

export function loadManifest(): Manifest {
  const file = process.env.MANIFEST ?? path.join(repoRoot(), "deployments/local.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
  const addr = (value: string) => getAddress(value);
  return {
    ...raw,
    escrow: addr(raw.escrow),
    quotes: addr(raw.quotes),
    executor: addr(raw.executor),
    rehearsalMarket: addr(raw.rehearsalMarket),
    debtToken: addr(raw.debtToken),
    collateralToken: addr(raw.collateralToken),
    pauseGuardian: addr(raw.pauseGuardian),
    openBorrower: addr(raw.openBorrower),
    seededBorrower: addr(raw.seededBorrower),
    demoMaker: addr(raw.demoMaker),
    deployer: addr(raw.deployer),
    guardian: addr(raw.guardian),
    oracle: addr(raw.oracle),
    protocolFeeRecipient: addr(raw.protocolFeeRecipient),
  };
}

export function explainError(error: unknown): string {
  if (error instanceof BaseError) {
    const reverted = error.walk((item) => item instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name) return name;
      return reverted.shortMessage;
    }
    return error.shortMessage;
  }
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function stringify(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(stringify);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (/^\d+$/.test(key)) continue;
      out[key] = stringify(item);
    }
    return out;
  }
  return value;
}

export function createRuntime(db: DB) {
  const manifest = loadManifest();
  const abis = {
    escrow: loadAbi("NectarEscrow"),
    quotes: loadAbi("NectarQuotes"),
    executor: loadAbi("NectarExecutor"),
    market: loadAbi("RehearsalMarket"),
    token: loadAbi("MockERC20"),
    pause: loadAbi("PauseGuardian"),
  };
  const allAbi = [
    ...abis.escrow,
    ...abis.quotes,
    ...abis.executor,
    ...abis.market,
    ...abis.pause,
  ] as Abi;
  const chain = defineChain({
    id: manifest.chainId,
    name: manifest.chainId === 31337 ? "Local Anvil" : "Arbitrum Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [process.env.RPC_URL ?? "http://127.0.0.1:8545"] } },
  });
  const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8545";
  const publicClient = createPublicClient({ chain, transport: http(rpc) });

  async function readMany(contracts: Array<{ address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }>) {
    return Promise.all(
      contracts.map((contract) =>
        publicClient.readContract({
          address: contract.address,
          abi: contract.abi,
          functionName: contract.functionName,
          args: contract.args,
        } as never),
      ),
    );
  }
  let syncQueue: Promise<void> = Promise.resolve();
  let rpcFailure: string | null = null;

  function demoAccounts() {
    if (manifest.chainId !== 31337) return null;
    const makerKey = process.env.DEMO_MAKER_KEY as Hex | undefined;
    const keeperKey = process.env.DEMO_KEEPER_KEY as Hex | undefined;
    if (!makerKey || !keeperKey) return null;
    const maker = privateKeyToAccount(makerKey);
    const keeper = privateKeyToAccount(keeperKey);
    if (maker.address.toLowerCase() !== DEMO_MAKER.toLowerCase()) {
      throw new Error("DEMO_MAKER_KEY does not match the local rehearsal maker.");
    }
    if (keeper.address.toLowerCase() !== DEMO_KEEPER.toLowerCase()) {
      throw new Error("DEMO_KEEPER_KEY does not match the local rehearsal keeper.");
    }
    const makerWallet = createWalletClient({ account: maker, chain, transport: http(rpc) });
    const keeperWallet = createWalletClient({ account: keeper, chain, transport: http(rpc) });
    return { maker, keeper, makerWallet, keeperWallet };
  }

  function sync() {
    const run = syncQueue.then(async () => {
      const head = await publicClient.getBlockNumber();
      rpcFailure = null;
      const stored = metaGet(db, "lastBlock");
      let from = stored ? BigInt(stored) + 1n : BigInt(manifest.startBlock || 0);
      if (stored && BigInt(stored) > head) {
        clearLogs(db, manifest.chainId);
        clearJobs(db);
        metaSet(db, "lastBlock", "-1");
        from = 0n;
      }
      if (from > head) return;
      const addresses = [manifest.escrow, manifest.quotes, manifest.executor, manifest.pauseGuardian];
      const span = 2_000n;
      for (let start = from; start <= head; start += span) {
        const end = start + span - 1n > head ? head : start + span - 1n;
        const logs = await publicClient.getLogs({ address: addresses, fromBlock: start, toBlock: end });
        for (const log of logs) {
          try {
            const decoded = decodeEventLog({ abi: allAbi, data: log.data, topics: log.topics });
            insertLog(db, {
              chainId: manifest.chainId,
              txHash: log.transactionHash!,
              logIndex: log.logIndex!,
              blockNumber: Number(log.blockNumber),
              address: getAddress(log.address),
              eventName: decoded.eventName,
              data: JSON.stringify(stringify(decoded.args)),
            });
          } catch {
            // Ignore events from other contracts that share the address filter.
          }
        }
      }
      metaSet(db, "lastBlock", head.toString());
    });
    syncQueue = run.catch(() => undefined);
    return run;
  }

  async function readQuote(id: bigint, now: bigint) {
    const result = (await publicClient.readContract({
      address: manifest.quotes,
      abi: abis.quotes,
      functionName: "getQuote",
      args: [id],
    })) as readonly [Record<string, unknown>, number];
    const quote = result[0];
    const status = Number(result[1]);
    const validUntil = BigInt(quote.validUntil as bigint);
    let lifecycle = ["unknown", "active", "filled", "released"][status] ?? "unknown";
    if (lifecycle === "active" && now >= validUntil) lifecycle = "expired";
    return {
      schemaVersion: Number(quote.schemaVersion),
      maker: getAddress(quote.maker as Address),
      makerNonce: (quote.makerNonce as bigint).toString(),
      marketKey: quote.marketKey as Hex,
      adapterVersion: Number(quote.adapterVersion),
      borrower: getAddress(quote.borrower as Address),
      collateralToken: getAddress(quote.collateralToken as Address),
      collateralAmount: (quote.collateralAmount as bigint).toString(),
      debtToken: getAddress(quote.debtToken as Address),
      cashOut: (quote.cashOut as bigint).toString(),
      maxDebtRepay: (quote.maxDebtRepay as bigint).toString(),
      collateralRecipient: getAddress(quote.collateralRecipient as Address),
      keeperCompensation: (quote.keeperCompensation as bigint).toString(),
      protocolFee: (quote.protocolFee as bigint).toString(),
      minNetSurplus: (quote.minNetSurplus as bigint).toString(),
      keeperRecipient: getAddress(quote.keeperRecipient as Address),
      surplusRecipient: getAddress(quote.surplusRecipient as Address),
      validUntil: validUntil.toString(),
      reservationId: (quote.reservationId as bigint).toString(),
      policyHash: quote.policyHash as Hex,
      quoteNonce: (quote.quoteNonce as bigint).toString(),
      status: lifecycle,
      onchainStatus: status,
    };
  }

  function quoteMessage(json: Awaited<ReturnType<typeof readQuote>>): QuoteMessage {
    return {
      schemaVersion: json.schemaVersion,
      maker: json.maker,
      makerNonce: BigInt(json.makerNonce),
      marketKey: json.marketKey,
      adapterVersion: json.adapterVersion,
      borrower: json.borrower,
      collateralToken: json.collateralToken,
      collateralAmount: BigInt(json.collateralAmount),
      debtToken: json.debtToken,
      cashOut: BigInt(json.cashOut),
      maxDebtRepay: BigInt(json.maxDebtRepay),
      collateralRecipient: json.collateralRecipient,
      keeperCompensation: BigInt(json.keeperCompensation),
      protocolFee: BigInt(json.protocolFee),
      minNetSurplus: BigInt(json.minNetSurplus),
      keeperRecipient: json.keeperRecipient,
      surplusRecipient: json.surplusRecipient,
      validUntil: BigInt(json.validUntil),
      reservationId: BigInt(json.reservationId),
      policyHash: json.policyHash,
      quoteNonce: BigInt(json.quoteNonce),
    };
  }

  async function assemble(wallet?: Address) {
    await sync();
    const block = await publicClient.getBlock();
    const now = block.timestamp;
    const [paused, price, priceStatus, marketKey, policyHash, lltvBps, bonusBps, label, borrowerCount, liabilities, priceUpdatedAt] =
      await readMany([
          { address: manifest.pauseGuardian, abi: abis.pause, functionName: "paused" },
          { address: manifest.rehearsalMarket, abi: abis.market, functionName: "price" },
          { address: manifest.rehearsalMarket, abi: abis.market, functionName: "priceStatus" },
          { address: manifest.rehearsalMarket, abi: abis.market, functionName: "marketKey" },
          { address: manifest.rehearsalMarket, abi: abis.market, functionName: "policyHash" },
          { address: manifest.rehearsalMarket, abi: abis.market, functionName: "lltvBps" },
          { address: manifest.rehearsalMarket, abi: abis.market, functionName: "bonusBps" },
          { address: manifest.rehearsalMarket, abi: abis.market, functionName: "label" },
          { address: manifest.rehearsalMarket, abi: abis.market, functionName: "borrowerCount" },
          { address: manifest.escrow, abi: abis.escrow, functionName: "liabilities", args: [manifest.debtToken] },
          { address: manifest.rehearsalMarket, abi: abis.market, functionName: "priceUpdatedAt" },
      ]);

    const count = Number(borrowerCount);
    const borrowers: Address[] = [];
    if (count > 0) {
      const listed = await readMany(
        Array.from({ length: count }, (_, index) => ({
          address: manifest.rehearsalMarket,
          abi: abis.market,
          functionName: "borrowerList",
          args: [BigInt(index)],
        })),
      );
      for (const item of listed) borrowers.push(getAddress(item as Address));
    }

    const positions = [];
    for (const borrower of borrowers) {
      const [collateral, debt, liquidatable, value, maxBorrow] = await readMany([
        { address: manifest.rehearsalMarket, abi: abis.market, functionName: "collateralOf", args: [borrower] },
        { address: manifest.rehearsalMarket, abi: abis.market, functionName: "debtOf", args: [borrower] },
        { address: manifest.rehearsalMarket, abi: abis.market, functionName: "isLiquidatable", args: [borrower] },
        { address: manifest.rehearsalMarket, abi: abis.market, functionName: "collateralValueOf", args: [borrower] },
        { address: manifest.rehearsalMarket, abi: abis.market, functionName: "maxBorrow", args: [borrower] },
      ]);
      let seizure: string | null = null;
      if (Number(priceStatus) === 0 && (debt as bigint) > 0n) {
        const seized = (await publicClient.readContract({
          address: manifest.rehearsalMarket,
          abi: abis.market,
          functionName: "seizureFor",
          args: [debt as bigint],
        })) as bigint;
        seizure = seized.toString();
      }
      positions.push({
        borrower,
        collateral: (collateral as bigint).toString(),
        debt: (debt as bigint).toString(),
        liquidatable: Boolean(liquidatable),
        collateralValue: (value as bigint).toString(),
        maxBorrow: (maxBorrow as bigint).toString(),
        seizure,
      });
    }

    const ids = new Set<string>();
    for (const row of listLogs(db, manifest.chainId, "QuoteReserved")) {
      const data = JSON.parse(String(row.data)) as { reservationId?: string };
      if (data.reservationId) ids.add(data.reservationId);
    }
    const quotes = [];
    for (const id of ids) {
      quotes.push(await readQuote(BigInt(id), now));
    }

    const receipts = listLogs(db, manifest.chainId, "LiquidationSettled").map((row) => {
      const data = JSON.parse(String(row.data)) as Record<string, string>;
      return {
        chainId: manifest.chainId,
        txHash: String(row.tx_hash),
        logIndex: Number(row.log_index),
        blockNumber: Number(row.block_number),
        finality: manifest.chainId === 31337 ? "local-included" : "l2-included",
        ...data,
      };
    });

    let liquidity = null;
    if (wallet) {
      const account = getAddress(wallet);
      const [cashPair, walletDebt, walletColl] = await readMany([
        { address: manifest.escrow, abi: abis.escrow, functionName: "accountOf", args: [account, manifest.debtToken] },
        { address: manifest.debtToken, abi: abis.token, functionName: "balanceOf", args: [account] },
        { address: manifest.collateralToken, abi: abis.token, functionName: "balanceOf", args: [account] },
      ]);
      const pair = cashPair as readonly [bigint, bigint];
      const cash = pair[0];
      const reserved = pair[1];
      liquidity = {
        wallet: account,
        chainId: manifest.chainId,
        token: manifest.debtToken,
        symbol: manifest.debtSymbol,
        decimals: manifest.debtDecimals,
        collateralSymbol: manifest.collateralSymbol,
        collateralDecimals: manifest.collateralDecimals,
        walletDebt: (walletDebt as bigint).toString(),
        walletCollateral: (walletColl as bigint).toString(),
        cash: cash.toString(),
        reserved: reserved.toString(),
        available: (cash - reserved).toString(),
      };
    }

    const activeQuotes = quotes.filter((quote) => quote.status === "active");
    const covered = new Set(
      activeQuotes.filter((quote) => quote.borrower).map((quote) => quote.borrower.toLowerCase()),
    );
    let unserved = 0n;
    let executable = 0n;
    for (const position of positions) {
      if (!position.liquidatable) continue;
      const debt = BigInt(position.debt);
      if (covered.has(position.borrower.toLowerCase())) executable += debt;
      else unserved += debt;
    }

    const priceState = Number(priceStatus) === 0 ? "fresh" : Number(priceStatus) === 1 ? "unavailable" : "stale";
    return {
      blockNumber: block.number.toString(),
      observedAt: new Date(Number(now) * 1000).toISOString(),
      paused: Boolean(paused),
      market: {
        marketKey: marketKey as Hex,
        policyHash: policyHash as Hex,
        label: String(label),
        protocol: "Nectar rehearsal market",
        protocolNote: "Local lending fixture for this prototype. Not Morpho Blue and not a production market.",
        chainId: manifest.chainId,
        debtToken: manifest.debtToken,
        debtSymbol: manifest.debtSymbol,
        debtDecimals: manifest.debtDecimals,
        collateralToken: manifest.collateralToken,
        collateralSymbol: manifest.collateralSymbol,
        collateralDecimals: manifest.collateralDecimals,
        price: (price as bigint).toString(),
        priceStatus: priceState,
        priceUpdatedAt: (priceUpdatedAt as bigint).toString(),
        lltvBps: (lltvBps as bigint).toString(),
        bonusBps: (bonusBps as bigint).toString(),
        positions,
        quoteCount: activeQuotes.length,
        routes: ["funded-quote"],
        ammRoute: null,
        unservedDebt: unserved.toString(),
        executableDebt: executable.toString(),
      },
      liabilities: (liabilities as bigint).toString(),
      quotes,
      receipts,
      liquidity,
    };
  }

  async function safeAssemble(wallet?: Address) {
    try {
      const data = await assemble(wallet);
      rpcFailure = null;
      return { freshness: "live" as const, error: null as string | null, data };
    } catch (error) {
      rpcFailure = explainError(error);
      return { freshness: "unavailable" as const, error: rpcFailure, data: null };
    }
  }

  function meta(freshness: "live" | "unavailable" | "stale", extra?: { blockNumber?: string; observedAt?: string }) {
    return {
      environment: "testnet",
      scope: manifest.scope,
      audited: false,
      freshness,
      chainId: manifest.chainId,
      blockNumber: extra?.blockNumber ?? null,
      observedAt: extra?.observedAt ?? null,
      rpc: freshness === "live" ? "ok" : "unavailable",
      label: manifest.label,
      error: freshness === "live" ? null : rpcFailure,
    };
  }

  async function nextNonce(maker: Address) {
    let nonce = 1n;
    for (let i = 0; i < 1000; i++) {
      const used = (await publicClient.readContract({
        address: manifest.quotes,
        abi: abis.quotes,
        functionName: "usedNonce",
        args: [maker, nonce],
      })) as boolean;
      const existing = (await publicClient.readContract({
        address: manifest.quotes,
        abi: abis.quotes,
        functionName: "status",
        args: [nonce],
      })) as number;
      if (!used && Number(existing) === 0) return nonce;
      nonce += 1n;
    }
    throw new Error("No free quote nonce.");
  }

  async function buildQuote(maker: Address, keeper: Address, borrower: Address): Promise<QuoteMessage> {
    const block = await publicClient.getBlock();
    const [marketKey, policyHash, debt] = await readMany([
      { address: manifest.rehearsalMarket, abi: abis.market, functionName: "marketKey" },
      { address: manifest.rehearsalMarket, abi: abis.market, functionName: "policyHash" },
      { address: manifest.rehearsalMarket, abi: abis.market, functionName: "debtOf", args: [borrower] },
    ]);
    const repay = debt as bigint;
    const seizure = (await publicClient.readContract({
      address: manifest.rehearsalMarket,
      abi: abis.market,
      functionName: "seizureFor",
      args: [repay],
    })) as bigint;
    const nonce = await nextNonce(maker);
    const fees = KEEPER_FEE + PROTOCOL_FEE + MIN_SURPLUS;
    return {
      schemaVersion: 1,
      maker,
      makerNonce: nonce,
      marketKey: marketKey as Hex,
      adapterVersion: 1,
      borrower,
      collateralToken: manifest.collateralToken,
      collateralAmount: seizure,
      debtToken: manifest.debtToken,
      cashOut: repay + fees,
      maxDebtRepay: repay,
      collateralRecipient: maker,
      keeperCompensation: KEEPER_FEE,
      protocolFee: PROTOCOL_FEE,
      minNetSurplus: MIN_SURPLUS,
      keeperRecipient: keeper,
      surplusRecipient: maker,
      validUntil: block.timestamp + 100n,
      reservationId: nonce,
      policyHash: policyHash as Hex,
      quoteNonce: nonce,
    };
  }

  async function outlookForNewQuote(message: QuoteMessage) {
    const [paused, priceStatus, liquidatable, debt, seize, collateral, account] = (await readMany([
      { address: manifest.pauseGuardian, abi: abis.pause, functionName: "paused" },
      { address: manifest.rehearsalMarket, abi: abis.market, functionName: "priceStatus" },
      { address: manifest.rehearsalMarket, abi: abis.market, functionName: "isLiquidatable", args: [message.borrower] },
      { address: manifest.rehearsalMarket, abi: abis.market, functionName: "debtOf", args: [message.borrower] },
      { address: manifest.rehearsalMarket, abi: abis.market, functionName: "seizureFor", args: [message.maxDebtRepay] },
      { address: manifest.rehearsalMarket, abi: abis.market, functionName: "collateralOf", args: [message.borrower] },
      { address: manifest.escrow, abi: abis.escrow, functionName: "accountOf", args: [message.maker, message.debtToken] },
    ])) as [boolean, number, boolean, bigint, bigint, bigint, readonly [bigint, bigint]];
    const fail = (reason: string) => ({
      ok: false,
      code: -1,
      reason,
      repay: "0",
      seize: "0",
      surplus: "0",
    });
    if (paused) return fail("SCOPE_PAUSED");
    if (Number(priceStatus) === 1) return fail("PRICE_UNAVAILABLE");
    if (Number(priceStatus) === 2) return fail("PRICE_STALE");
    if (!liquidatable) return fail("INELIGIBLE");
    const repay = debt;
    if (repay === 0n || repay > message.maxDebtRepay) return fail("MAX_DEBT");
    if (seize === 0n || seize !== message.collateralAmount || collateral < seize) return fail("COLLATERAL_MISMATCH");
    const fees = message.keeperCompensation + message.protocolFee;
    if (fees > message.cashOut) return fail("INSUFFICIENT_PROCEEDS");
    const afterFees = message.cashOut - fees;
    if (afterFees < repay) return fail("INSUFFICIENT_PROCEEDS");
    const surplus = afterFees - repay;
    if (surplus < message.minNetSurplus) return fail("INSUFFICIENT_PROCEEDS");
    const cash = account[0];
    const reserved = account[1];
    if (cash - reserved < message.cashOut) return fail("INSUFFICIENT_CASH");
    return {
      ok: true,
      code: 0,
      reason: "OK",
      repay: repay.toString(),
      seize: seize.toString(),
      surplus: surplus.toString(),
    };
  }

  async function preview(message: QuoteMessage) {
    const result = (await publicClient.readContract({
      address: manifest.executor,
      abi: abis.executor,
      functionName: "preview",
      args: [message],
    })) as readonly [number, string, bigint, bigint, bigint];
    return {
      code: Number(result[0]),
      reason: result[1],
      repay: result[2].toString(),
      seize: result[3].toString(),
      surplus: result[4].toString(),
      ok: Number(result[0]) === 0,
    };
  }

  function requireDemo() {
    const accounts = demoAccounts();
    if (!accounts) {
      const error = new Error(
        manifest.chainId === 31337
          ? "Local rehearsal signer is not configured. Start the API with scripts/dev-up.sh."
          : "Automatic signing is only enabled on local Anvil (chain 31337).",
      );
      (error as Error & { code?: string; status?: number }).code = "DEMO_DISABLED";
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    return accounts;
  }

  async function send(
    kind: string,
    jobId: string | undefined,
    detail: Record<string, unknown>,
    run: () => Promise<Hex>,
  ) {
    let job = jobId ? getJob(db, jobId) : null;
    if (!job) job = createJob(db, kind, detail);
    updateJob(db, job.id, { status: "submitted", detail: JSON.stringify({ ...detail, phase: "submitted" }) });
    try {
      const hash = await run();
      updateJob(db, job.id, { status: "submitted", tx_hash: hash, detail: JSON.stringify({ ...detail, txHash: hash }) });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const status = receipt.status === "success" ? "included" : "reverted";
      updateJob(db, job.id, {
        status,
        tx_hash: hash,
        reason: status === "reverted" ? "Transaction reverted" : null,
        detail: JSON.stringify({ ...detail, txHash: hash, blockNumber: receipt.blockNumber.toString() }),
      });
      await sync();
      return publicJob(getJob(db, job.id)!);
    } catch (error) {
      const reason = explainError(error);
      updateJob(db, job.id, {
        status: "reverted",
        reason,
        detail: JSON.stringify({ ...detail, error: reason }),
      });
      return publicJob(getJob(db, job.id)!);
    }
  }

  return {
    manifest,
    meta,
    safeAssemble,
    demoAccounts,
    requireDemo,
    preview,
    buildQuote,
    quoteMessage,
    readQuote,
    publicClient,
    abis,
    async planDeposit(amountRaw: string) {
      const amount = parseUnits(amountRaw, manifest.debtDecimals);
      if (amount <= 0n) throw Object.assign(new Error("Enter an amount greater than zero."), { status: 400, code: "BAD_AMOUNT" });
      const accounts = requireDemo();
      const balance = (await publicClient.readContract({
        address: manifest.debtToken,
        abi: abis.token,
        functionName: "balanceOf",
        args: [accounts.maker.address],
      })) as bigint;
      if (balance < amount) {
        throw Object.assign(new Error("Wallet balance is below that deposit."), { status: 400, code: "INSUFFICIENT_CASH" });
      }
      return {
        network: chainLabel(),
        asset: manifest.debtSymbol,
        amount: amount.toString(),
        decimals: manifest.debtDecimals,
        destination: manifest.escrow,
        destinationLabel: "Nectar maker escrow",
        expiry: null,
        fee: "No protocol fee. Gas is paid by the local rehearsal signer in test ETH.",
        notes: ["Deposit credits only this maker. It does not become a quote until you publish one."],
      };
    },
    async confirmDeposit(amountRaw: string, jobId?: string) {
      const plan = await this.planDeposit(amountRaw);
      const accounts = requireDemo();
      const amount = BigInt(plan.amount);
      const allowance = (await publicClient.readContract({
        address: manifest.debtToken,
        abi: abis.token,
        functionName: "allowance",
        args: [accounts.maker.address, manifest.escrow],
      })) as bigint;
      return send("deposit", jobId, { plan }, async () => {
        if (allowance < amount) {
          const approval = await accounts.makerWallet.writeContract({
            address: manifest.debtToken,
            abi: abis.token,
            functionName: "approve",
            args: [manifest.escrow, amount],
          });
          await publicClient.waitForTransactionReceipt({ hash: approval });
        }
        return accounts.makerWallet.writeContract({
          address: manifest.escrow,
          abi: abis.escrow,
          functionName: "deposit",
          args: [manifest.debtToken, amount, accounts.maker.address],
        });
      });
    },
    async planQuote(borrower?: Address) {
      const accounts = requireDemo();
      const target = borrower ? getAddress(borrower) : manifest.openBorrower;
      const message = await buildQuote(accounts.maker.address, accounts.keeper.address, target);
      const raw = await preview(message).catch((error) => ({
        ok: false,
        code: -1,
        reason: explainError(error),
        repay: message.maxDebtRepay.toString(),
        seize: message.collateralAmount.toString(),
        surplus: "0",
      }));
      // Executor preview refuses every unregistered quote with QUOTE_NOT_ACTIVE before it
      // looks at the position. Registration review should show the market checks instead.
      const view = raw.reason === "QUOTE_NOT_ACTIVE" ? await outlookForNewQuote(message) : raw;
      const sym = manifest.debtSymbol;
      const dec = manifest.debtDecimals;
      return {
        network: chainLabel(),
        asset: manifest.debtSymbol,
        amount: message.cashOut.toString(),
        decimals: manifest.debtDecimals,
        destination: manifest.quotes,
        destinationLabel: "Nectar quote registry",
        expiry: message.validUntil.toString(),
        fee: `Keeper ${formatUnits(KEEPER_FEE, dec)} ${sym}, protocol ${formatUnits(PROTOCOL_FEE, dec)} ${sym}, minimum surplus ${formatUnits(MIN_SURPLUS, dec)} ${sym}.`,
        collateralAmount: message.collateralAmount.toString(),
        borrower: target,
        preview: view,
        quote: stringify(message),
        notes: [
          "Registration reserves the full cashOut. This prototype cannot cancel the quote before expiry.",
          "Maximum lifetime is 120 seconds.",
          "The quote is not onchain until you submit. The executor cannot see it yet.",
        ],
      };
    },
    async confirmQuote(borrower?: Address, jobId?: string) {
      const accounts = requireDemo();
      const target = borrower ? getAddress(borrower) : manifest.openBorrower;
      const message = await buildQuote(accounts.maker.address, accounts.keeper.address, target);
      const signature = await accounts.maker.signTypedData({
        domain: {
          name: EIP712_NAME,
          version: EIP712_VERSION,
          chainId: manifest.chainId,
          verifyingContract: manifest.quotes,
        },
        types: quoteTypes,
        primaryType: "Quote",
        message,
      });
      return send("publish_quote", jobId, { quote: stringify(message) }, () =>
        accounts.makerWallet.writeContract({
          address: manifest.quotes,
          abi: abis.quotes,
          functionName: "registerQuote",
          args: [message, signature],
        }),
      );
    },
    async planExecute(reservationId: string) {
      const block = await publicClient.getBlock();
      const json = await readQuote(BigInt(reservationId), block.timestamp);
      const message = quoteMessage(json);
      const view = await preview(message);
      return {
        network: chainLabel(),
        asset: manifest.debtSymbol,
        amount: json.cashOut,
        decimals: manifest.debtDecimals,
        destination: manifest.executor,
        destinationLabel: "Nectar executor",
        expiry: json.validUntil,
        fee: `Keeper ${formatUnits(BigInt(json.keeperCompensation), manifest.debtDecimals)} ${manifest.debtSymbol} and protocol ${formatUnits(BigInt(json.protocolFee), manifest.debtDecimals)} ${manifest.debtSymbol}, paid from reserved cash on success.`,
        preview: view,
        quote: json,
        notes: ["The keeper submits one transaction. If any check fails, the whole settlement reverts."],
      };
    },
    async confirmExecute(reservationId: string, jobId?: string) {
      const accounts = requireDemo();
      const block = await publicClient.getBlock();
      const json = await readQuote(BigInt(reservationId), block.timestamp);
      const message = quoteMessage(json);
      return send("execute", jobId, { reservationId, quote: json }, () =>
        accounts.keeperWallet.writeContract({
          address: manifest.executor,
          abi: abis.executor,
          functionName: "execute",
          args: [message],
        }),
      );
    },
    async planWithdraw(amountRaw: string) {
      const accounts = requireDemo();
      const amount = parseUnits(amountRaw, manifest.debtDecimals);
      const pair = (await publicClient.readContract({
        address: manifest.escrow,
        abi: abis.escrow,
        functionName: "accountOf",
        args: [accounts.maker.address, manifest.debtToken],
      })) as readonly [bigint, bigint];
      const available = pair[0] - pair[1];
      if (amount > available) {
        const reservedNow = pair[1] > 0n && amount <= pair[0];
        throw Object.assign(
          new Error(
            reservedNow
              ? `That amount is still reserved. Withdrawable cash is ${available.toString()} base units.`
              : `Withdrawable cash is ${available.toString()} base units.`,
          ),
          { status: 400, code: reservedNow ? "RESERVED_FUNDS" : "INSUFFICIENT_CASH", available: available.toString() },
        );
      }
      return {
        network: chainLabel(),
        asset: manifest.debtSymbol,
        amount: amount.toString(),
        decimals: manifest.debtDecimals,
        destination: accounts.maker.address,
        destinationLabel: "Maker wallet",
        expiry: null,
        fee: "No protocol fee. Gas is paid by the local rehearsal signer in test ETH.",
        available: available.toString(),
        reserved: pair[1].toString(),
        notes: ["Only unreserved cash can move. A live quote cannot be cancelled to free it early."],
      };
    },
    async confirmWithdraw(amountRaw: string, jobId?: string) {
      const plan = await this.planWithdraw(amountRaw);
      const accounts = requireDemo();
      return send("withdraw", jobId, { plan }, () =>
        accounts.makerWallet.writeContract({
          address: manifest.escrow,
          abi: abis.escrow,
          functionName: "withdraw",
          args: [manifest.debtToken, BigInt(plan.amount), accounts.maker.address],
        }),
      );
    },
    async confirmRelease(reservationId: string, jobId?: string) {
      const accounts = requireDemo();
      return send("release", jobId, { reservationId }, () =>
        accounts.makerWallet.writeContract({
          address: manifest.quotes,
          abi: abis.quotes,
          functionName: "releaseExpired",
          args: [BigInt(reservationId)],
        }),
      );
    },
  };

  function chainLabel() {
    if (manifest.chainId === 31337) {
      return {
        name: "Local Anvil rehearsal",
        chainId: 31337,
        warning: "Connected RPC is local Anvil, not Arbitrum Sepolia and not Robinhood Chain.",
      };
    }
    return {
      name: "Arbitrum Sepolia",
      chainId: manifest.chainId,
      warning: "Public testnet. Rehearsal market is not production Morpho.",
    };
  }
}
