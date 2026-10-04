import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath =
  process.env.NECTAR_MANIFEST ||
  path.resolve(__dirname, "../../deployments/testnet.json");

export type Manifest = {
  network: string;
  networkPassphrase: string;
  rpcUrl: string;
  horizonUrl: string;
  deployer: string;
  marketKey: string;
  contracts: {
    debtToken: string;
    collateralToken: string;
    mockLending: string;
    quoteEscrow: string;
    nectarExecutor: string;
  };
  decimals: number;
  fixture: Record<string, string>;
};

export const manifest: Manifest = JSON.parse(
  fs.readFileSync(manifestPath, "utf8"),
);

export const config = {
  port: Number(process.env.PORT || 8787),
  secretKey: process.env.NECTAR_SECRET_KEY || "",
  rpcUrl: process.env.STELLAR_RPC_URL || manifest.rpcUrl,
  networkPassphrase:
    process.env.STELLAR_NETWORK_PASSPHRASE || manifest.networkPassphrase,
  manifest,
};
