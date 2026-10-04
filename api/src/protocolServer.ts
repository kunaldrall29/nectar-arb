import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Address, type Hex } from "viem";
import {
  executorAbi,
  morphoAbi,
  poolAbi,
  quoteEscrowAbi,
  registryAbi,
} from "../../packages/sdk/src/index.ts";
import { openDb, publicJob, listJobs, insertLog, listLogs } from "./db.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

type Manifest = {
  protocol: string;
  chainId: number;
  networkName: string;
  audited: boolean;
  sandbox: boolean;
  officialMorpho: boolean;
  debtSymbol: string;
  collateralSymbol: string;
  debtDecimals: number;
  collateralDecimals: number;
  repayAssets: string;
  lltv: string;
  quoteEscrow: Address;
  executor: Address;
  marketRegistry: Address;
  adapter: Address;
  sandboxMorpho: Address;
  propPool: Address;
  debtToken: Address;
  collateralToken: Address;
  oracle: Address;
  marketId: Hex;
  policyId: Hex;
  quoteBorrower: Address;
  propBorrower: Address;
  maker: Address;
  keeper: Address;
  deployer: Address;
  protocolFeeRecipient: Address;
  surplusRecipient: Address;
  startBlock: number;
  swapAdapter: Address;
  router: Address;
  riskGuard: Address;
};

function loadManifest(): Manifest {
  const file = process.env.MANIFEST ?? path.join(root, "deployments/protocol-local.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
}

function str(value: bigint | number | string) {
  return value.toString();
}

export async function startProtocolServer(manifest = loadManifest()) {
  const db = openDb(path.join(root, "api/data/nectar.db"));
  const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8545";
  const chain = {
    id: manifest.chainId,
    name: manifest.networkName,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  };
  const client = createPublicClient({ chain, transport: http(rpc) });
  const marketParams = {
    loanToken: manifest.debtToken,
    collateralToken: manifest.collateralToken,
    oracle: manifest.oracle,
    irm: "0x0000000000000000000000000000000000000000" as Address,
    lltv: BigInt(manifest.lltv),
  };

  async function freshness() {
    try {
      const block = await client.getBlock();
      return { ok: true, blockNumber: block.number.toString(), observedAt: new Date().toISOString() };
    } catch (error) {
      return { ok: false, blockNumber: null, observedAt: new Date().toISOString(), error: error instanceof Error ? error.message : "rpc" };
    }
  }

  async function index() {
    const head = await freshness();
    if (!head.ok || head.blockNumber == null) return head;
    const logs = await client.getLogs({
      address: manifest.executor,
      event: executorAbi[2],
      fromBlock: BigInt(manifest.startBlock || 0),
      toBlock: BigInt(head.blockNumber),
    });
    logs.forEach((log, indexNo) => {
      insertLog(db, {
        chainId: manifest.chainId,
        txHash: log.transactionHash ?? "",
        logIndex: Number(log.logIndex ?? indexNo),
        blockNumber: Number(log.blockNumber ?? 0),
        address: log.address,
        eventName: "LiquidationSettled",
        data: JSON.stringify(log.args, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
      });
    });
    return head;
  }

  function fileReceipts() {
    const dir = path.join(root, "api/data/receipts");
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as Record<string, string>);
  }

  const app = new Hono();
  app.use("*", cors());

  app.get("/health", async (c) => {
    const head = await freshness();
    return c.json({
      ok: head.ok,
      service: "nectar-api",
      protocol: manifest.protocol,
      chainId: manifest.chainId,
      networkName: manifest.networkName,
      environment: "testnet",
      audited: false,
      store: "sqlite",
      blockNumber: head.blockNumber,
      observedAt: head.observedAt,
    });
  });

  app.get("/v1/networks", (c) =>
    c.json({
      environment: "testnet",
      connected: {
        chainId: manifest.chainId,
        name: manifest.networkName,
        spendableWithOtherChains: false,
      },
      networks: [
        {
          id: "local",
          chainId: 31337,
          name: "Local Anvil",
          status: manifest.chainId === 31337 ? "connected" : "not-connected",
          detail: "Local protocol session. Balances here are not Arbitrum Sepolia or Robinhood balances.",
        },
        {
          id: "arbitrum-sepolia",
          chainId: 421614,
          name: "Arbitrum Sepolia",
          status: "not-deployed",
          detail: "Deployer balance was 0 wei. No contract addresses are listed.",
        },
        {
          id: "robinhood-testnet",
          chainId: 46630,
          name: "Robinhood Chain testnet",
          status: "rehearsal-deployed",
          detail:
            "The earlier rehearsal bytecode is deployed. It is not this protocol module set. Balances on that chain are not spendable here.",
        },
      ],
    }),
  );

  app.get("/v1/markets", async (c) => {
    const head = await freshness();
    if (!head.ok) return c.json({ meta: head, markets: [] });
    const count = await client.readContract({
      address: manifest.marketRegistry,
      abi: registryAbi,
      functionName: "marketCount",
    });
    const markets = [];
    for (let i = 0n; i < count; i++) {
      const id = await client.readContract({
        address: manifest.marketRegistry,
        abi: registryAbi,
        functionName: "marketIdAt",
        args: [i],
      });
      const market = await client.readContract({
        address: manifest.marketRegistry,
        abi: registryAbi,
        functionName: "getMarket",
        args: [id],
      });
      const quotePreview = await client.readContract({
        address: manifest.sandboxMorpho,
        abi: morphoAbi,
        functionName: "previewLiquidate",
        args: [marketParams, manifest.quoteBorrower, BigInt(manifest.repayAssets)],
      });
      markets.push({
        marketId: market.marketId,
        debtToken: market.debtToken,
        collateralToken: market.collateralToken,
        debtSymbol: manifest.debtSymbol,
        collateralSymbol: manifest.collateralSymbol,
        adapter: market.adapter,
        morpho: market.morpho,
        officialMorpho: false,
        sandboxLabel: "Nectar Sandbox Morpho",
        policyHash: market.policyHash,
        policyVersion: str(market.policyVersion),
        lltv: str(market.lltv),
        paused: market.paused,
        quoteBorrower: {
          address: manifest.quoteBorrower,
          seized: str(quotePreview[0]),
          repaid: str(quotePreview[1]),
          unhealthy: quotePreview[2],
        },
      });
    }
    return c.json({ meta: head, markets });
  });

  app.get("/v1/markets/:id", async (c) => {
    const listed = await app.request("/v1/markets");
    const body = (await listed.json()) as { markets: Array<{ marketId: string }> };
    const market = body.markets.find((item) => item.marketId.toLowerCase() === c.req.param("id").toLowerCase());
    if (!market) return c.json({ error: { code: "UNSUPPORTED_MARKET", message: "No market with that id is registered." } }, 404);
    return c.json({ market });
  });

  app.get("/v1/quotes", async (c) => {
    const head = await freshness();
    if (!head.ok) return c.json({ meta: head, quotes: [] });
    const count = await client.readContract({ address: manifest.quoteEscrow, abi: quoteEscrowAbi, functionName: "quoteCount" });
    const quotes = [];
    for (let i = 0n; i < count; i++) {
      const id = await client.readContract({
        address: manifest.quoteEscrow,
        abi: quoteEscrowAbi,
        functionName: "quoteIdAt",
        args: [i],
      });
      const [quote, status] = await client.readContract({
        address: manifest.quoteEscrow,
        abi: quoteEscrowAbi,
        functionName: "getQuote",
        args: [id],
      });
      quotes.push({
        reservationId: str(quote.reservationId),
        maker: quote.maker,
        borrower: quote.borrower,
        cashOut: str(quote.cashOut),
        collateralAmount: str(quote.collateralAmount),
        keeperCompensation: str(quote.keeperCompensation),
        protocolFee: str(quote.protocolFee),
        minNetSurplus: str(quote.minNetSurplus),
        validUntil: str(quote.validUntil),
        status: str(status),
        debtToken: quote.debtToken,
      });
    }
    return c.json({ meta: head, quotes });
  });

  app.get("/v1/pools", async (c) => {
    const head = await freshness();
    if (!head.ok) return c.json({ meta: head, pools: [] });
    const [inventory, debtBalance, cap, maker, updater, spread] = await Promise.all([
      client.readContract({ address: manifest.propPool, abi: poolAbi, functionName: "collateralInventory" }),
      client.readContract({ address: manifest.propPool, abi: poolAbi, functionName: "debtBalance" }),
      client.readContract({ address: manifest.propPool, abi: poolAbi, functionName: "inventoryCap" }),
      client.readContract({ address: manifest.propPool, abi: poolAbi, functionName: "maker" }),
      client.readContract({ address: manifest.propPool, abi: poolAbi, functionName: "pricingUpdater" }),
      client.readContract({ address: manifest.propPool, abi: poolAbi, functionName: "baseSpreadBps" }),
    ]);
    const preview = await client.readContract({
      address: manifest.sandboxMorpho,
      abi: morphoAbi,
      functionName: "previewLiquidate",
      args: [marketParams, manifest.propBorrower, BigInt(manifest.repayAssets)],
    });
    const bid = await client.readContract({
      address: manifest.propPool,
      abi: poolAbi,
      functionName: "previewBid",
      args: [preview[0]],
    });
    return c.json({
      meta: head,
      pools: [
        {
          address: manifest.propPool,
          maker,
          pricingUpdater: updater,
          collateralInventory: str(inventory),
          debtBalance: str(debtBalance),
          inventoryCap: str(cap),
          baseSpreadBps: str(spread),
          indicativeBid: str(bid[0]),
          bidLive: bid[1],
          publicLpShares: false,
        },
      ],
    });
  });

  app.get("/v1/receipts", async (c) => {
    const head = await index();
    const indexed = listLogs(db, manifest.chainId, "LiquidationSettled")
      .filter((row) => String(row.address).toLowerCase() === manifest.executor.toLowerCase())
      .map((row) => {
      const data = JSON.parse(String(row.data));
      return {
        txHash: row.tx_hash,
        blockNumber: String(row.block_number),
        route: String(data.route ?? ""),
        borrower: data.borrower ?? null,
        debtRepaid: String(data.debtRepaid ?? ""),
        collateralAmount: String(data.collateralAmount ?? ""),
        keeperCompensation: String(data.keeperCompensation ?? ""),
        protocolFee: String(data.protocolFee ?? ""),
        surplus: String(data.surplus ?? ""),
      };
    });
    const files = fileReceipts();
    const seen = new Set(indexed.map((item) => String(item.txHash).toLowerCase()));
    for (const file of files) {
      if (file.txHash && !seen.has(file.txHash.toLowerCase())) indexed.push(file);
    }
    return c.json({ meta: head, receipts: indexed, jobs: listJobs(db).map(publicJob) });
  });

  app.get("/v1/preview/quote", async (c) => {
    const head = await freshness();
    let disabledReason: string | null = null;
    let seized = "0";
    if (!head.ok) disabledReason = "RPC is not reachable, so a quote cannot be prepared.";
    else {
      const preview = await client.readContract({
        address: manifest.sandboxMorpho,
        abi: morphoAbi,
        functionName: "previewLiquidate",
        args: [marketParams, manifest.quoteBorrower, 10000n],
      });
      seized = preview[0].toString();
      if (!preview[2]) disabledReason = "Quote borrower has no remaining liquidatable debt on this chain.";
    }
    const expiry = head.ok ? "30 seconds from the next block timestamp" : "unavailable";
    return c.json({
      network: { name: manifest.networkName, chainId: manifest.chainId },
      asset: manifest.debtSymbol,
      amount: "10140",
      debtRepay: "10000",
      collateralAmount: seized,
      destination: manifest.quoteEscrow,
      destinationLabel: "Quote escrow, full cashOut reserved until fill or expiry",
      expiry,
      fee: "Keeper 50, protocol fee 20, minimum surplus 70. Sum 10140.",
      disabledReason,
      testnet: true,
    });
  });

  app.post("/v1/actions/:scenario", async (c) => {
    const scenario = c.req.param("scenario");
    if (scenario !== "funded-quote" && scenario !== "propamm") {
      return c.json({ error: { code: "UNKNOWN", message: "Supported actions are funded-quote and propamm." } }, 400);
    }
    const body = (await c.req.json().catch(() => ({}))) as { confirm?: boolean };
    if (!body.confirm) {
      return c.json(
        {
          error: {
            code: "CONFIRM",
            message: "Confirm network, asset, amount, destination, expiry, and fee before submitting.",
          },
        },
        400,
      );
    }
    if (manifest.chainId !== 31337) {
      return c.json(
        { error: { code: "WRONG_NETWORK", message: "This API only submits with the local Anvil signer on chain 31337." } },
        400,
      );
    }
    const tsxBin = path.join(root, "node_modules/tsx/dist/cli.mjs");
    const child = spawnSync(process.execPath, [tsxBin, path.join(root, "scripts/scenario.mjs"), "--network", "local", "--scenario", scenario], {
      encoding: "utf8",
      cwd: root,
    });
    if (child.status !== 0) {
      const message = (child.stderr || child.stdout || "The scenario reverted.").trim();
      return c.json({ error: { code: "SCENARIO_FAILED", message } }, 400);
    }
    const receipt = JSON.parse(child.stdout);
    return c.json({ receipt });
  });

  app.get("/v1/analytics", async (c) => {
    const listed = await app.request("/v1/receipts");
    const body = (await listed.json()) as { receipts: Array<Record<string, string>> };
    return c.json({
      environment: "testnet",
      label: "Indexed lab settlements only. Not revenue and not production volume.",
      count: body.receipts.length,
      receipts: body.receipts,
    });
  });

  const port = Number(process.env.PORT ?? 8787);
  serve({ fetch: app.fetch, hostname: "0.0.0.0", port }, () => {
    console.log(`nectar protocol api listening on ${port} chain ${manifest.chainId}`);
  });
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked.endsWith("protocolServer.ts") || invoked.endsWith("protocolServer.js")) {
  await startProtocolServer();
}
