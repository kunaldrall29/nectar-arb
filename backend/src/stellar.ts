import {
  Address,
  Contract,
  Keypair,
  nativeToScVal,
  Networks,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { config, manifest } from "./config.js";

const server = new rpc.Server(config.rpcUrl, { allowHttp: true });

function getKeypair(): Keypair | null {
  if (!config.secretKey) return null;
  return Keypair.fromSecret(config.secretKey);
}

export async function readContract<T = unknown>(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<T> {
  const account = await server.getAccount(
    getKeypair()?.publicKey() || manifest.deployer,
  );
  const tx = new TransactionBuilder(account, {
    fee: "100000",
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`Simulation failed for ${method}: ${JSON.stringify(sim)}`);
  }
  const retval = sim.result?.retval;
  if (!retval) {
    throw new Error(`No return value for ${method}`);
  }
  return scValToNative(retval) as T;
}

export async function invokeContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
  source?: Keypair,
): Promise<{ hash: string; result: unknown }> {
  const kp = source || getKeypair();
  if (!kp) {
    throw new Error("NECTAR_SECRET_KEY is required for write operations");
  }
  const account = await server.getAccount(kp.publicKey());
  let tx = new TransactionBuilder(account, {
    fee: "1000000",
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(kp);
  const send = await server.sendTransaction(prepared);
  if (send.status === "ERROR") {
    throw new Error(`Send failed: ${JSON.stringify(send)}`);
  }

  let getResp = await server.getTransaction(send.hash);
  const start = Date.now();
  while (getResp.status === "NOT_FOUND" && Date.now() - start < 60_000) {
    await new Promise((r) => setTimeout(r, 1500));
    getResp = await server.getTransaction(send.hash);
  }
  if (getResp.status !== "SUCCESS") {
    throw new Error(`Tx ${send.hash} status=${getResp.status}`);
  }

  let result: unknown = null;
  if (getResp.returnValue) {
    result = scValToNative(getResp.returnValue);
  }
  return { hash: send.hash, result };
}

export function addr(value: string): xdr.ScVal {
  return Address.fromString(value).toScVal();
}

export function i128(value: string | number | bigint): xdr.ScVal {
  return nativeToScVal(BigInt(value), { type: "i128" });
}

export function u32(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: "u32" });
}

export function u64(value: number | bigint): xdr.ScVal {
  return nativeToScVal(BigInt(value), { type: "u64" });
}

export function str(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: "string" });
}

export function bytesN32(hexOrBytes: string | Buffer): xdr.ScVal {
  const buf =
    typeof hexOrBytes === "string"
      ? Buffer.from(hexOrBytes.replace(/^0x/, ""), "hex")
      : hexOrBytes;
  return nativeToScVal(buf, { type: "bytes" });
}

export { server, Networks, Keypair, scValToNative };
