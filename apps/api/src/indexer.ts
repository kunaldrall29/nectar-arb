import {
  createPublicClient,
  decodeEventLog,
  http,
  type Log,
} from "viem";
import { db } from "./db.js";
import { escrowAbi, executorAbi } from "./abis.js";
import { chain, getRpcUrl, loadManifest } from "./config.js";

export async function syncIndexer(fromBlock?: bigint) {
  const manifest = loadManifest();
  if (!manifest) {
    return { synced: false, reason: "no deployment manifest" };
  }

  const client = createPublicClient({ chain, transport: http(getRpcUrl()) });
  const escrow = manifest.contracts.QuoteEscrow as `0x${string}`;
  const executor = manifest.contracts.NectarExecutor as `0x${string}`;

  const latest = await client.getBlockNumber();
  const start = fromBlock ?? BigInt(manifest.blockNumber);

  const escrowLogs = await client.getLogs({
    address: escrow,
    fromBlock: start,
    toBlock: latest,
  });
  const executorLogs = await client.getLogs({
    address: executor,
    fromBlock: start,
    toBlock: latest,
  });

  const insert = db.prepare(
    `INSERT OR IGNORE INTO indexed_events (id, chain_id, contract, event_name, block_number, tx_hash, log_index, payload)
     VALUES (@id, @chainId, @contract, @eventName, @blockNumber, @txHash, @logIndex, @payload)`
  );

  for (const log of [...escrowLogs, ...executorLogs] as Log[]) {
    const id = `${manifest.chainId}:${log.transactionHash}:${log.logIndex}`;
    let eventName = "Unknown";
    let payload: Record<string, unknown> = { topics: log.topics, data: log.data };

    try {
      const decoded = decodeEventLog({
        abi: log.address?.toLowerCase() === escrow.toLowerCase() ? escrowAbi : executorAbi,
        data: log.data,
        topics: log.topics,
      });
      eventName = decoded.eventName;
      payload = decoded.args as Record<string, unknown>;
      handleDecoded(manifest.chainId, eventName, payload, Number(log.blockNumber), log.transactionHash ?? "");
    } catch {
      // ignore non-matching logs
    }

    insert.run({
      id,
      chainId: manifest.chainId,
      contract: log.address,
      eventName,
      blockNumber: Number(log.blockNumber),
      txHash: log.transactionHash,
      logIndex: Number(log.logIndex),
      payload: JSON.stringify(payload, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
    });
  }

  return { synced: true, fromBlock: start.toString(), toBlock: latest.toString(), events: escrowLogs.length + executorLogs.length };
}

function handleDecoded(
  chainId: number,
  eventName: string,
  args: Record<string, unknown>,
  blockNumber: number,
  txHash: string
) {
  if (eventName === "QuoteReserved") {
    db.prepare(
      `INSERT OR REPLACE INTO quotes (reservation_id, chain_id, maker, token, amount, valid_until, status, block_number)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`
    ).run(
      args.reservationId as string,
      chainId,
      args.maker as string,
      args.token as string,
      String(args.amount),
      Number(args.validUntil),
      blockNumber
    );
  }
  if (eventName === "QuoteConsumed") {
    db.prepare(`UPDATE quotes SET status = 'filled' WHERE reservation_id = ?`).run(args.reservationId as string);
  }
  if (eventName === "QuoteReleased") {
    db.prepare(`UPDATE quotes SET status = 'released' WHERE reservation_id = ?`).run(args.reservationId as string);
  }
  if (eventName === "LiquidationSettled") {
    db.prepare(
      `INSERT OR REPLACE INTO receipts (job_id, chain_id, market_key, reservation_id, borrower, debt_repaid, collateral_amount, tx_hash, block_number, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      args.jobId as string,
      chainId,
      args.marketKey as string,
      args.reservationId as string,
      args.borrower as string,
      String(args.debtRepaid),
      String(args.collateralAmount),
      txHash,
      blockNumber,
      JSON.stringify(args)
    );
  }
}
