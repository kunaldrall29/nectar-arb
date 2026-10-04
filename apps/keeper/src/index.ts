import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  mockMorphoAbi,
  nectarExecutorAbi,
  quoteEscrowAbi,
  deserializeQuote,
  type NectarQuote,
} from "@nectar/sdk";

type Deployment = {
  chainId: number;
  rpc: string;
  marketKey: Hex;
  morphoMarketId: Hex;
  borrower: `0x${string}`;
  policyHash: Hex;
  addresses: Record<string, `0x${string}`>;
};

type State = {
  lastTx?: Hex;
  lastNonce?: number;
  lastJobId?: string;
};

const root = path.resolve(process.cwd(), process.cwd().includes("apps/keeper") ? "../.." : ".");
const statePath = path.join(root, "data/keeper-state.json");

function loadDeployment(): Deployment {
  const chain = process.env.CHAIN_ID || "31337";
  const file =
    chain === "421614"
      ? "deployments/arbitrum-sepolia.json"
      : chain === "46630"
        ? "deployments/robinhood-testnet.json"
        : "deployments/anvil.json";
  const p = path.join(root, file);
  if (!existsSync(p)) throw new Error(`Missing ${file}. Deploy first.`);
  return JSON.parse(readFileSync(p, "utf8"));
}

function loadState(): State {
  if (!existsSync(statePath)) return {};
  return JSON.parse(readFileSync(statePath, "utf8"));
}

function saveState(s: State) {
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(s, null, 2));
}

async function tick() {
  const d = loadDeployment();
  const pk = process.env.KEEPER_PRIVATE_KEY as Hex | undefined;
  if (!pk) throw new Error("KEEPER_PRIVATE_KEY is required");
  const account = privateKeyToAccount(pk);
  const transport = http(process.env.RPC_URL || d.rpc);
  const publicClient = createPublicClient({ transport });
  const wallet = createWalletClient({ account, transport });

  const state = loadState();
  const nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "latest" });
  if (state.lastTx) {
    const rec = await publicClient.getTransactionReceipt({ hash: state.lastTx }).catch(() => null);
    if (!rec) {
      console.log("pending previous broadcast", state.lastTx, "— not rebroadcasting");
      return;
    }
    console.log("previous tx", rec.status, rec.transactionHash);
  }

  const unhealthy = (await publicClient.readContract({
    address: d.addresses.morpho,
    abi: mockMorphoAbi,
    functionName: "isUnhealthy",
    args: [d.morphoMarketId, d.borrower],
  })) as boolean;
  if (!unhealthy) {
    console.log("no unhealthy position");
    return;
  }

  const quotePath = path.join(root, "data/active-quote.json");
  if (!existsSync(quotePath)) {
    console.log("no data/active-quote.json — run the seed script");
    return;
  }
  const stored = JSON.parse(readFileSync(quotePath, "utf8")) as {
    quote: Record<string, string>;
    quoteId: Hex;
  };
  const quote: NectarQuote = deserializeQuote(stored.quote);
  const rec = await publicClient.readContract({
    address: d.addresses.escrow,
    abi: quoteEscrowAbi,
    functionName: "getQuote",
    args: [stored.quoteId],
  }) as { reserved: boolean; consumed: boolean; validUntil: bigint };
  if (!rec.reserved || rec.consumed) {
    console.log("quote not active", stored.quoteId);
    return;
  }
  if (BigInt(Math.floor(Date.now() / 1000)) >= rec.validUntil) {
    console.log("quote expired — not submitting");
    return;
  }

  const job = {
    marketKey: d.marketKey,
    borrower: d.borrower,
    seizedCollateral: quote.collateralAmount,
    maxDebtRepay: quote.maxDebtRepay,
    quoteId: stored.quoteId,
    deadline: quote.validUntil,
    keeper: account.address,
  };
  const route = { kind: 0, amm: d.addresses.amm, minOut: 0n };

  const preview = await publicClient.readContract({
    address: d.addresses.executor,
    abi: nectarExecutorAbi,
    functionName: "previewJob",
    args: [job, quote, route],
  }) as { ok: boolean; reason: Hex; ammEstimate: bigint; surplus: bigint };
  console.log("preview", preview);
  if (!preview.ok) {
    console.log("preview refused, not submitting");
    return;
  }

  const hash = await wallet.writeContract({
    chain: null,
    address: d.addresses.executor,
    abi: nectarExecutorAbi,
    functionName: "executeJob",
    args: [job, quote, route],
    nonce,
  });
  saveState({ lastTx: hash, lastNonce: nonce, lastJobId: stored.quoteId });
  console.log("submitted", hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("included", receipt.status, "block", receipt.blockNumber.toString());
}

const once = process.argv.includes("--once");
if (once) {
  tick().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  const loop = async () => {
    try {
      await tick();
    } catch (e) {
      console.error("keeper tick failed", e);
    }
    setTimeout(loop, Number(process.env.KEEPER_POLL_MS || 4000));
  };
  loop();
}
