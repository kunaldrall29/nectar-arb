import express from "express";
import cors from "cors";
import {
  encodeFunctionData,
  formatUnits,
  keccak256,
  toHex,
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
  type Hex
} from "viem";
import { ESCROW_ABI, EXECUTOR_ABI, REGISTRY_ABI, ERC20_ABI, LENDING_ABI, QUOTE_TYPES } from "./abi.js";
import { chainId, deployment, getAccount, getWalletClient, publicClient, requireDeployment, rpcUrl } from "./chain.js";
import { store } from "./store.js";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 4000);

function idempotency(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = req.header("idempotency-key");
  if (req.method === "POST" && !key) {
    // Allow missing key in demo mode, but stamp one.
    (req as express.Request & { idem?: string }).idem = `demo-${Date.now()}`;
  }
  next();
}
app.use(idempotency);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "nectar-api",
    chainId,
    hasDeployment: Boolean(deployment),
    rpcUrl
  });
});

app.get("/v1/networks", async (_req, res) => {
  const block = await publicClient.getBlockNumber().catch(() => null);
  res.json({
    data: [
      {
        chainId: 421614,
        name: "Arbitrum Sepolia",
        status: deployment?.chainId === 421614 ? "active" : "configured",
        environment: "testnet",
        keeperAllowlist: true,
        contracts: deployment?.contracts ?? null,
        sourceBlock: block?.toString() ?? null,
        rpcHealthy: block !== null
      },
      {
        chainId: 46630,
        name: "Robinhood Chain Testnet",
        status: "monitored",
        environment: "testnet",
        keeperAllowlist: true,
        contracts: null,
        note: "Same Nectar interfaces; activation pending admission dossier."
      }
    ]
  });
});

app.get("/v1/markets", async (_req, res) => {
  try {
    const d = requireDeployment();
    const market = await publicClient.readContract({
      address: d.contracts.MARKET_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "getMarket",
      args: [d.marketKey]
    });
    const block = await publicClient.getBlockNumber();
    res.json({
      data: [
        {
          marketKey: d.marketKey,
          chainId: d.chainId,
          label: market.label,
          protocol: "Morpho Blue (mock adapter)",
          debtToken: market.debtToken,
          collateralToken: market.collateralToken,
          adapter: market.adapter,
          adapterVersion: market.adapterVersion.toString(),
          policyHash: market.policyHash,
          active: market.active,
          integrated: true,
          routes: ["funded_quote", "amm_placeholder"],
          unservedExposure: "0",
          sourceBlock: block.toString()
        },
        {
          marketKey: "0xmonitored_rh_usdg_aapl",
          chainId: 46630,
          label: "AAPL / USDG (Robinhood monitored)",
          protocol: "Morpho Blue",
          debtToken: null,
          collateralToken: null,
          integrated: false,
          routes: [],
          note: "Monitored only — no executable funded route yet."
        }
      ]
    });
  } catch (e) {
    res.status(503).json({ error: "RPC_UNAVAILABLE", message: String(e) });
  }
});

app.get("/v1/markets/:marketKey", async (req, res) => {
  try {
    const d = requireDeployment();
    const key = req.params.marketKey as Hex;
    const market = await publicClient.readContract({
      address: d.contracts.MARKET_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "getMarket",
      args: [key]
    });
    res.json({ data: market, sourceBlock: (await publicClient.getBlockNumber()).toString() });
  } catch (e) {
    res.status(404).json({ error: "UNSUPPORTED_MARKET", message: String(e) });
  }
});

app.get("/v1/accounts/:wallet/liquidity", async (req, res) => {
  try {
    const d = requireDeployment();
    const wallet = req.params.wallet as Address;
    const token = d.contracts.MOCK_DEBT_TOKEN;
    const [available, reserved, cash, walletBal] = await Promise.all([
      publicClient.readContract({
        address: d.contracts.QUOTE_ESCROW,
        abi: ESCROW_ABI,
        functionName: "availableCash",
        args: [wallet, token]
      }),
      publicClient.readContract({
        address: d.contracts.QUOTE_ESCROW,
        abi: ESCROW_ABI,
        functionName: "reservedCash",
        args: [wallet, token]
      }),
      publicClient.readContract({
        address: d.contracts.QUOTE_ESCROW,
        abi: ESCROW_ABI,
        functionName: "cashBalance",
        args: [wallet, token]
      }),
      publicClient.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [wallet]
      })
    ]);
    res.json({
      data: {
        chainId: d.chainId,
        wallet,
        token,
        symbol: "nUSD",
        decimals: 6,
        walletBalance: walletBal.toString(),
        cashBalance: cash.toString(),
        reservedCash: reserved.toString(),
        availableCash: available.toString(),
        display: {
          walletBalance: formatUnits(walletBal, 6),
          cashBalance: formatUnits(cash, 6),
          reservedCash: formatUnits(reserved, 6),
          availableCash: formatUnits(available, 6)
        }
      },
      sourceBlock: (await publicClient.getBlockNumber()).toString()
    });
  } catch (e) {
    res.status(503).json({ error: "RPC_UNAVAILABLE", message: String(e) });
  }
});

app.post("/v1/quotes", async (req, res) => {
  try {
    const d = requireDeployment();
    const body = req.body as {
      maker: Address;
      borrower: Address;
      collateralAmount: string;
      cashOut: string;
      maxDebtRepay: string;
      keeperCompensation?: string;
      protocolFee?: string;
      minNetSurplus?: string;
      lifetimeSeconds?: number;
      signature?: Hex;
      register?: boolean;
    };

    const nonce = await publicClient.readContract({
      address: d.contracts.QUOTE_ESCROW,
      abi: ESCROW_ABI,
      functionName: "nonces",
      args: [body.maker]
    });

    const lifetime = Math.min(Math.max(body.lifetimeSeconds ?? 30, 5), 120);
    const validUntil = BigInt(Math.floor(Date.now() / 1000) + lifetime);
    const reservationId = keccak256(
      encodeAbiParameters(parseAbiParameters("address,uint256,uint256"), [
        body.maker,
        BigInt(body.cashOut),
        BigInt(Date.now())
      ])
    );

    const quote = {
      schemaVersion: 1n,
      chainId: BigInt(d.chainId),
      verifyingContract: d.contracts.QUOTE_ESCROW,
      maker: body.maker,
      makerNonce: nonce,
      marketKey: d.marketKey,
      adapterVersion: 1n,
      borrower: body.borrower,
      collateralToken: d.contracts.MOCK_COLLATERAL_TOKEN,
      collateralAmount: BigInt(body.collateralAmount),
      debtToken: d.contracts.MOCK_DEBT_TOKEN,
      cashOut: BigInt(body.cashOut),
      maxDebtRepay: BigInt(body.maxDebtRepay),
      collateralRecipient: body.maker,
      keeperCompensation: BigInt(body.keeperCompensation ?? "50000000"),
      protocolFee: BigInt(body.protocolFee ?? "20000000"),
      minNetSurplus: BigInt(body.minNetSurplus ?? "70000000"),
      keeperRecipient: (getAccount()?.address ?? body.maker) as Address,
      surplusRecipient: body.maker,
      validUntil,
      reservationId,
      policyHash: d.policyHash,
      quoteNonce: 1n
    };

    const domain = {
      name: "NectarQuote",
      version: "1",
      chainId: d.chainId,
      verifyingContract: d.contracts.QUOTE_ESCROW
    };

    const serializable = Object.fromEntries(
      Object.entries(quote).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])
    );

    const stored = store.saveQuote({
      chainId: d.chainId,
      maker: body.maker,
      terms: serializable,
      status: body.signature ? "signed" : "draft",
      signature: body.signature
    });

    let txHash: Hex | undefined;
    let quoteId: Hex | undefined;
    if (body.signature && body.register) {
      const wallet = getWalletClient();
      const account = getAccount();
      if (!wallet || !account) {
        return res.status(400).json({ error: "NO_OPERATOR_KEY", message: "Operator key required for relayed register" });
      }
      // Maker must register themselves in production; demo allows maker==operator or pre-signed by maker with operator submitting if maker is operator.
      txHash = await wallet.writeContract({
        address: d.contracts.QUOTE_ESCROW,
        abi: ESCROW_ABI,
        functionName: "registerQuote",
        args: [quote, body.signature],
        account,
        chain: wallet.chain
      });
    }

    res.status(201).json({
      data: {
        id: stored.id,
        quote: serializable,
        typedData: { domain, types: QUOTE_TYPES, primaryType: "Quote", message: serializable },
        approveCalldata: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "approve",
          args: [d.contracts.QUOTE_ESCROW, quote.cashOut]
        }),
        depositCalldata: encodeFunctionData({
          abi: ESCROW_ABI,
          functionName: "deposit",
          args: [d.contracts.MOCK_DEBT_TOKEN, quote.cashOut, body.maker]
        }),
        registerTarget: d.contracts.QUOTE_ESCROW,
        status: stored.status,
        txHash,
        quoteId
      }
    });
  } catch (e) {
    res.status(400).json({ error: "QUOTE_BUILD_FAILED", message: String(e) });
  }
});

app.get("/v1/quotes", (_req, res) => {
  res.json({ data: store.listQuotes() });
});

app.get("/v1/quotes/:quoteId", (req, res) => {
  const q = store.getQuote(req.params.quoteId);
  if (!q) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ data: q });
});

app.post("/v1/jobs/preview", async (req, res) => {
  try {
    const d = requireDeployment();
    const job = normalizeJob(req.body.job ?? req.body, d);
    const [ok, reason] = await publicClient.readContract({
      address: d.contracts.NECTAR_EXECUTOR,
      abi: EXECUTOR_ABI,
      functionName: "previewJob",
      args: [job]
    });
    const stored = store.saveJob({
      chainId: d.chainId,
      status: ok ? "simulated" : "rejected",
      job: stringifyJob(job),
      preview: { ok, reason },
      refusalReason: ok ? undefined : reason
    });
    res.json({ data: { id: stored.id, ok, reason, job: stringifyJob(job) } });
  } catch (e) {
    res.status(400).json({ error: "PREVIEW_FAILED", message: String(e) });
  }
});

app.post("/v1/jobs", async (req, res) => {
  try {
    const d = requireDeployment();
    const wallet = getWalletClient();
    const account = getAccount();
    if (!wallet || !account) {
      return res.status(503).json({ error: "NO_KEEPER_KEY" });
    }
    const job = normalizeJob(req.body.job ?? req.body, d);
    const [ok, reason] = await publicClient.readContract({
      address: d.contracts.NECTAR_EXECUTOR,
      abi: EXECUTOR_ABI,
      functionName: "previewJob",
      args: [job]
    });
    if (!ok) {
      const stored = store.saveJob({
        chainId: d.chainId,
        status: "rejected",
        job: stringifyJob(job),
        preview: { ok, reason },
        refusalReason: reason
      });
      return res.status(400).json({ error: reason || "REJECTED", data: stored });
    }

    const stored = store.saveJob({
      chainId: d.chainId,
      status: "submitted",
      job: stringifyJob(job),
      preview: { ok, reason }
    });

    const txHash = await wallet.writeContract({
      address: d.contracts.NECTAR_EXECUTOR,
      abi: EXECUTOR_ABI,
      functionName: "executeJob",
      args: [job],
      account,
      chain: wallet.chain
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    store.updateJob(stored.id, {
      status: receipt.status === "success" ? "included" : "reverted",
      txHash
    });

    if (receipt.status === "success") {
      const j = stringifyJob(job);
      store.saveReceipt({
        chainId: d.chainId,
        jobId: stored.id,
        quoteId: j.quoteId,
        positionId: j.positionId,
        debtRepaid: j.maxDebtRepay,
        collateralSeized: j.collateralAmount,
        keeperCompensation: j.keeperCompensation,
        protocolFee: j.protocolFee,
        surplus: j.minNetSurplus,
        txHash,
        blockNumber: receipt.blockNumber.toString()
      });
      store.updateJob(stored.id, { status: "finalized" });
    }

    res.status(201).json({
      data: store.getJob(stored.id),
      txHash,
      explorer: `https://sepolia.arbiscan.io/tx/${txHash}`
    });
  } catch (e) {
    res.status(400).json({ error: "JOB_FAILED", message: String(e) });
  }
});

app.get("/v1/jobs", (_req, res) => res.json({ data: store.listJobs() }));
app.get("/v1/jobs/:jobId", (req, res) => {
  const j = store.getJob(req.params.jobId);
  if (!j) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ data: j });
});
app.get("/v1/receipts", (_req, res) => res.json({ data: store.listReceipts(), metrics: store.metrics() }));

app.get("/v1/analytics/overview", async (_req, res) => {
  const m = store.metrics();
  res.json({
    data: {
      testnetVolumeUsd: m.testnetVolumeUsd,
      recoveredDebtUsd: m.recoveredDebtUsd,
      quoteFillRate: m.quoteFillRate,
      activeMakers: m.activeMakers,
      stellarHeritageGrantUsd: 75_000,
      securityAudit: "in_progress",
      usp: "Funded, time-bounded bids consumed inside eligible liquidations — cash-backed execution, not hope."
    }
  });
});

/** Demo helpers: faucet + open liquidatable position + full happy path using operator key */
app.post("/v1/demo/faucet", async (req, res) => {
  try {
    const d = requireDeployment();
    const wallet = getWalletClient();
    const account = getAccount();
    if (!wallet || !account) return res.status(503).json({ error: "NO_OPERATOR_KEY" });
    const to = (req.body.to as Address) || account.address;
    const debtAmount = BigInt(req.body.debtAmount ?? "100000000000"); // 100k nUSD
    const collAmount = BigInt(req.body.collateralAmount ?? "100000000000000000000"); // 100 tAAPL
    const h1 = await wallet.writeContract({
      address: d.contracts.MOCK_DEBT_TOKEN,
      abi: ERC20_ABI,
      functionName: "mint",
      args: [to, debtAmount],
      account,
      chain: wallet.chain
    });
    const h2 = await wallet.writeContract({
      address: d.contracts.MOCK_COLLATERAL_TOKEN,
      abi: ERC20_ABI,
      functionName: "mint",
      args: [to, collAmount],
      account,
      chain: wallet.chain
    });
    res.json({ data: { to, debtTx: h1, collateralTx: h2 } });
  } catch (e) {
    res.status(400).json({ error: "FAUCET_FAILED", message: String(e) });
  }
});

app.post("/v1/demo/open-position", async (req, res) => {
  try {
    const d = requireDeployment();
    const wallet = getWalletClient();
    const account = getAccount();
    if (!wallet || !account) return res.status(503).json({ error: "NO_OPERATOR_KEY" });
    const borrower = (req.body.borrower as Address) || account.address;
    const collateralAmount = BigInt(req.body.collateralAmount ?? "10000000000000000000"); // 10
    const debtAmount = BigInt(req.body.debtAmount ?? "10000000000"); // 10_000 nUSD

    // Mint collateral to operator, approve, open position for borrower
    await wallet.writeContract({
      address: d.contracts.MOCK_COLLATERAL_TOKEN,
      abi: ERC20_ABI,
      functionName: "mint",
      args: [account.address, collateralAmount],
      account,
      chain: wallet.chain
    });
    await wallet.writeContract({
      address: d.contracts.MOCK_COLLATERAL_TOKEN,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [d.contracts.MOCK_LENDING, collateralAmount],
      account,
      chain: wallet.chain
    });
    const txHash = await wallet.writeContract({
      address: d.contracts.MOCK_LENDING,
      abi: LENDING_ABI,
      functionName: "openPosition",
      args: [
        borrower,
        d.contracts.MOCK_COLLATERAL_TOKEN,
        d.contracts.MOCK_DEBT_TOKEN,
        collateralAmount,
        debtAmount,
        true
      ],
      account,
      chain: wallet.chain
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    // Decode position id from return is hard via receipt; compute last by reading events isn't set — use eth_call simulation approach.
    // Re-open via eth_call is not stateful. Store tx and let client pass positionId from sim.
    // Better: eth_call openPosition to get return then... can't. Parse PositionOpened from logs.
    const positionId = await findPositionId(txHash);
    res.json({ data: { txHash, positionId, borrower, collateralAmount: collateralAmount.toString(), debtAmount: debtAmount.toString(), blockNumber: receipt.blockNumber.toString() } });
  } catch (e) {
    res.status(400).json({ error: "OPEN_POSITION_FAILED", message: String(e) });
  }
});

app.post("/v1/demo/run-liquidation", async (req, res) => {
  try {
    const d = requireDeployment();
    const wallet = getWalletClient();
    const account = getAccount();
    if (!wallet || !account) return res.status(503).json({ error: "NO_OPERATOR_KEY" });

    const maker = account.address;
    const borrower = (req.body.borrower as Address) || account.address;

    // 1) Ensure maker funded
    const cashOut = 10_140n * 10n ** 6n;
    const maxDebt = 10_000n * 10n ** 6n;
    const collateralAmount = 10n * 10n ** 18n;

    await wallet.writeContract({
      address: d.contracts.MOCK_DEBT_TOKEN,
      abi: ERC20_ABI,
      functionName: "mint",
      args: [maker, cashOut],
      account,
      chain: wallet.chain
    });
    await wallet.writeContract({
      address: d.contracts.MOCK_DEBT_TOKEN,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [d.contracts.QUOTE_ESCROW, cashOut],
      account,
      chain: wallet.chain
    });
    await wallet.writeContract({
      address: d.contracts.QUOTE_ESCROW,
      abi: ESCROW_ABI,
      functionName: "deposit",
      args: [d.contracts.MOCK_DEBT_TOKEN, cashOut, maker],
      account,
      chain: wallet.chain
    });

    // 2) Open liquidatable position
    await wallet.writeContract({
      address: d.contracts.MOCK_COLLATERAL_TOKEN,
      abi: ERC20_ABI,
      functionName: "mint",
      args: [maker, collateralAmount],
      account,
      chain: wallet.chain
    });
    await wallet.writeContract({
      address: d.contracts.MOCK_COLLATERAL_TOKEN,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [d.contracts.MOCK_LENDING, collateralAmount],
      account,
      chain: wallet.chain
    });
    const openTx = await wallet.writeContract({
      address: d.contracts.MOCK_LENDING,
      abi: LENDING_ABI,
      functionName: "openPosition",
      args: [borrower, d.contracts.MOCK_COLLATERAL_TOKEN, d.contracts.MOCK_DEBT_TOKEN, collateralAmount, maxDebt, true],
      account,
      chain: wallet.chain
    });
    const positionId = await findPositionId(openTx);

    // 3) Sign + register quote
    const nonce = await publicClient.readContract({
      address: d.contracts.QUOTE_ESCROW,
      abi: ESCROW_ABI,
      functionName: "nonces",
      args: [maker]
    });
    const reservationId = keccak256(toHex(`res-${Date.now()}-${Math.random()}`));
    const quote = {
      schemaVersion: 1n,
      chainId: BigInt(d.chainId),
      verifyingContract: d.contracts.QUOTE_ESCROW,
      maker,
      makerNonce: nonce,
      marketKey: d.marketKey,
      adapterVersion: 1n,
      borrower,
      collateralToken: d.contracts.MOCK_COLLATERAL_TOKEN,
      collateralAmount,
      debtToken: d.contracts.MOCK_DEBT_TOKEN,
      cashOut,
      maxDebtRepay: maxDebt,
      collateralRecipient: maker,
      keeperCompensation: 50n * 10n ** 6n,
      protocolFee: 20n * 10n ** 6n,
      minNetSurplus: 70n * 10n ** 6n,
      keeperRecipient: maker,
      surplusRecipient: maker,
      validUntil: BigInt(Math.floor(Date.now() / 1000) + 90),
      reservationId,
      policyHash: d.policyHash,
      quoteNonce: 1n
    };

    const signature = await wallet.signTypedData({
      account,
      domain: {
        name: "NectarQuote",
        version: "1",
        chainId: d.chainId,
        verifyingContract: d.contracts.QUOTE_ESCROW
      },
      types: QUOTE_TYPES,
      primaryType: "Quote",
      message: quote
    });

    const regTx = await wallet.writeContract({
      address: d.contracts.QUOTE_ESCROW,
      abi: ESCROW_ABI,
      functionName: "registerQuote",
      args: [quote, signature],
      account,
      chain: wallet.chain
    });
    await publicClient.waitForTransactionReceipt({ hash: regTx });
    const quoteId = keccak256(
      encodeAbiParameters(parseAbiParameters("bytes32,address,uint256"), [reservationId, maker, 1n])
    );

    const job = {
      marketKey: d.marketKey,
      positionId,
      quoteId,
      borrower,
      collateralToken: d.contracts.MOCK_COLLATERAL_TOKEN,
      collateralAmount,
      debtToken: d.contracts.MOCK_DEBT_TOKEN,
      maxDebtRepay: maxDebt,
      collateralRecipient: maker,
      keeperRecipient: maker,
      surplusRecipient: maker,
      keeperCompensation: 50n * 10n ** 6n,
      protocolFee: 20n * 10n ** 6n,
      minNetSurplus: 70n * 10n ** 6n,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 90)
    };

    const execTx = await wallet.writeContract({
      address: d.contracts.NECTAR_EXECUTOR,
      abi: EXECUTOR_ABI,
      functionName: "executeJob",
      args: [job],
      account,
      chain: wallet.chain
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: execTx });

    const storedJob = store.saveJob({
      chainId: d.chainId,
      status: receipt.status === "success" ? "finalized" : "reverted",
      job: stringifyJob(job),
      preview: { ok: true, reason: "" },
      txHash: execTx
    });
    if (receipt.status === "success") {
      store.saveReceipt({
        chainId: d.chainId,
        jobId: storedJob.id,
        quoteId,
        positionId,
        debtRepaid: maxDebt.toString(),
        collateralSeized: collateralAmount.toString(),
        keeperCompensation: (50n * 10n ** 6n).toString(),
        protocolFee: (20n * 10n ** 6n).toString(),
        surplus: (70n * 10n ** 6n).toString(),
        txHash: execTx,
        blockNumber: receipt.blockNumber.toString()
      });
      store.saveQuote({
        chainId: d.chainId,
        maker,
        terms: stringifyJob(quote as unknown as Record<string, bigint | Address | Hex>),
        status: "filled",
        signature,
        quoteId,
        txHash: regTx
      });
    }

    res.json({
      data: {
        openTx,
        registerTx: regTx,
        executeTx: execTx,
        positionId,
        quoteId,
        job: storedJob,
        status: receipt.status,
        explorer: `https://sepolia.arbiscan.io/tx/${execTx}`
      }
    });
  } catch (e) {
    res.status(400).json({ error: "DEMO_LIQUIDATION_FAILED", message: String(e) });
  }
});

app.get("/v1/deployment", (_req, res) => {
  res.json({
    data: deployment,
    deployerPublicAddress: getAccount()?.address ?? null,
    fundWallet: "0xa6CdB06Dc088Fa28cE1b170309f34e8dB739AF74",
    faucetHint: "Fund Arbitrum Sepolia ETH via https://faucet.quicknode.com/arbitrum/sepolia or Alchemy faucet"
  });
});

function normalizeJob(input: Record<string, unknown>, d: NonNullable<typeof deployment>) {
  return {
    marketKey: (input.marketKey as Hex) || d.marketKey,
    positionId: input.positionId as Hex,
    quoteId: input.quoteId as Hex,
    borrower: input.borrower as Address,
    collateralToken: (input.collateralToken as Address) || d.contracts.MOCK_COLLATERAL_TOKEN,
    collateralAmount: BigInt(String(input.collateralAmount)),
    debtToken: (input.debtToken as Address) || d.contracts.MOCK_DEBT_TOKEN,
    maxDebtRepay: BigInt(String(input.maxDebtRepay)),
    collateralRecipient: input.collateralRecipient as Address,
    keeperRecipient: input.keeperRecipient as Address,
    surplusRecipient: input.surplusRecipient as Address,
    keeperCompensation: BigInt(String(input.keeperCompensation ?? "0")),
    protocolFee: BigInt(String(input.protocolFee ?? "0")),
    minNetSurplus: BigInt(String(input.minNetSurplus ?? "0")),
    deadline: BigInt(String(input.deadline ?? Math.floor(Date.now() / 1000) + 60))
  };
}

function stringifyJob(job: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(job).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])) as Record<
    string,
    string
  >;
}

async function findPositionId(txHash: Hex): Promise<Hex> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  // PositionOpened(bytes32,address,uint256,uint256) — topic0
  const topic0 = keccak256(toHex("PositionOpened(bytes32,address,uint256,uint256)"));
  for (const log of receipt.logs) {
    if (log.topics[0] === topic0 && log.topics[1]) return log.topics[1];
  }
  throw new Error("PositionOpened event not found");
}

app.listen(PORT, () => {
  console.log(`Nectar API listening on :${PORT}`);
  console.log(`chainId=${chainId} deployment=${deployment ? "yes" : "no"}`);
});
