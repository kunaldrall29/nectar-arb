import {
  Address,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import {
  ADMIN_PUBLIC,
  CONTRACTS,
  HORIZON_URL,
  MARKET_KEY,
  NETWORK_PASSPHRASE,
  RPC_URL,
} from "./config";

export const UNIT = 10_000_000n;
export const server = new rpc.Server(RPC_URL, { allowHttp: false });

export function adminKey(): Keypair {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error("ADMIN_SECRET is not configured");
  return Keypair.fromSecret(secret);
}

export function scAddress(id: string) {
  return new Address(id).toScVal();
}

export function scI128(value: bigint | string | number) {
  return nativeToScVal(typeof value === "bigint" ? value : BigInt(value), {
    type: "i128",
  });
}

export function scU32(value: number) {
  return nativeToScVal(value, { type: "u32" });
}

export function scU64(value: number | bigint) {
  return nativeToScVal(typeof value === "bigint" ? value : BigInt(value), {
    type: "u64",
  });
}

export function scSymbol(value: string) {
  return nativeToScVal(value, { type: "symbol" });
}

export function scBytes32(hex: string) {
  return nativeToScVal(Buffer.from(hex, "hex"), { type: "bytesN" });
}

export function scMap(fields: Record<string, xdr.ScVal>) {
  const entries = Object.keys(fields)
    .sort()
    .map((key) =>
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol(key),
        val: fields[key],
      }),
    );
  return xdr.ScVal.scvMap(entries);
}

export async function invoke(opts: {
  contract: string;
  method: string;
  args?: xdr.ScVal[];
  source: Keypair;
  simulateOnly?: boolean;
}): Promise<{ result: unknown; hash?: string; ledger?: number }> {
  const account = await server.getAccount(opts.source.publicKey());
  const contract = new Contract(opts.contract);
  const tx = new TransactionBuilder(account, {
    fee: "200000",
    networkPassphrase: NETWORK_PASSPHRASE || Networks.TESTNET,
  })
    .addOperation(contract.call(opts.method, ...(opts.args || [])))
    .setTimeout(90)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }
  let retval: unknown = null;
  try {
    retval = sim.result?.retval ? scValToNative(sim.result.retval) : null;
  } catch {
    retval = null;
  }
  if (opts.simulateOnly) {
    return { result: retval };
  }

  const prepared = rpc.assembleTransaction(tx, sim).build();
  prepared.sign(opts.source);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER") {
    throw new Error(
      `send failed: ${sent.status} ${JSON.stringify(sent.errorResult || sent)}`,
    );
  }

  const hash = sent.hash;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const got = await server.getTransaction(hash);
    if (got.status === "SUCCESS") {
      let parsed: unknown = retval;
      try {
        const rv = (got as { returnValue?: unknown }).returnValue;
        if (rv) parsed = scValToNative(rv as Parameters<typeof scValToNative>[0]);
      } catch {
        parsed = retval;
      }
      return {
        result: parsed,
        hash,
        ledger: got.ledger,
      };
    }
    if (got.status === "FAILED") {
      throw new Error(`transaction failed: ${hash}`);
    }
  }
  throw new Error(`transaction not confirmed: ${hash}`);
}

export async function read(contract: string, method: string, args: xdr.ScVal[] = []) {
  const source = Keypair.random();
  try {
    const account = await server.getAccount(ADMIN_PUBLIC);
    const tx = new TransactionBuilder(account, {
      fee: "100000",
      networkPassphrase: NETWORK_PASSPHRASE || Networks.TESTNET,
    })
      .addOperation(new Contract(contract).call(method, ...args))
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw new Error(sim.error);
    }
    return sim.result?.retval ? scValToNative(sim.result.retval) : null;
  } catch (err) {
    // Fallback: fundless random account cannot load; use admin account above.
    throw err;
  }
}

export async function friendbot(address: string) {
  const official = await fetch(`https://friendbot.stellar.org/?addr=${address}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!official.ok) {
    const text = await official.text();
    if (!text.includes("op_already_exists") && !text.includes("create_account")) {
      throw new Error(`friendbot failed: ${text.slice(0, 220)}`);
    }
  }
  return { ok: true, address };
}

export async function getAccount(maker: string, token = CONTRACTS.usdc) {
  return read(CONTRACTS.nectar, "get_account", [scAddress(maker), scAddress(token)]);
}

export async function getMarket(marketKey = MARKET_KEY) {
  return read(CONTRACTS.nectar, "get_market", [scBytes32(marketKey)]);
}

export async function getQuote(quoteId: string) {
  return read(CONTRACTS.nectar, "get_quote", [scBytes32(quoteId)]);
}

export async function getReceipt(quoteId: string) {
  return read(CONTRACTS.nectar, "get_receipt", [scBytes32(quoteId)]);
}

export async function getPosition(borrower: string) {
  return read(CONTRACTS.lending, "get_position", [scAddress(borrower)]);
}

export async function isLiquidatable(borrower: string) {
  return read(CONTRACTS.lending, "is_liquidatable", [scAddress(borrower)]);
}

export async function tokenBalance(token: string, id: string) {
  return read(token, "balance", [scAddress(id)]);
}

export async function mint(to: string, token: string, amount: bigint) {
  return invoke({
    contract: token,
    method: "mint",
    args: [scAddress(to), scI128(amount)],
    source: adminKey(),
  });
}

export function quoteSpec(input: {
  borrower: string;
  maker: string;
  cashOut: bigint;
  collateralAmount: bigint;
  maxDebtRepay: bigint;
  keeper: string;
  validUntil: number;
  keeperCompensation?: bigint;
  protocolFee?: bigint;
  minNetSurplus?: bigint;
}) {
  return scMap({
    borrower: scAddress(input.borrower),
    cash_out: scI128(input.cashOut),
    collateral_amount: scI128(input.collateralAmount),
    collateral_recipient: scAddress(input.maker),
    keeper_compensation: scI128(input.keeperCompensation ?? 50n * UNIT),
    keeper_recipient: scAddress(input.keeper),
    market_key: scBytes32(MARKET_KEY),
    max_debt_repay: scI128(input.maxDebtRepay),
    min_net_surplus: scI128(input.minNetSurplus ?? 70n * UNIT),
    protocol_fee: scI128(input.protocolFee ?? 20n * UNIT),
    surplus_recipient: scAddress(input.maker),
    valid_until: scU64(input.validUntil),
  });
}
