import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Account
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import fs from "node:fs";
import path from "node:path";

export type Deployment = {
  chainId: number;
  network: string;
  rpcUrl: string;
  deployer: Address;
  marketKey: Hex;
  policyHash: Hex;
  contracts: {
    MOCK_DEBT_TOKEN: Address;
    MOCK_COLLATERAL_TOKEN: Address;
    MOCK_LENDING: Address;
    QUOTE_ESCROW: Address;
    MARKET_REGISTRY: Address;
    RISK_GUARD: Address;
    NECTAR_EXECUTOR: Address;
    MORPHO_ADAPTER: Address;
  };
};

const ROOT = path.resolve(process.cwd(), "..");
const DEPLOY_PATH = process.env.DEPLOYMENT_PATH || path.join(ROOT, "deployments", "latest.json");

function loadDeployment(): Deployment | null {
  if (!fs.existsSync(DEPLOY_PATH)) return null;
  return JSON.parse(fs.readFileSync(DEPLOY_PATH, "utf8")) as Deployment;
}

export function getPrivateKey(): Hex | null {
  if (process.env.PRIVATE_KEY) return process.env.PRIVATE_KEY as Hex;
  const secretPath = path.join(ROOT, ".secrets", "DEPLOYER_PRIVATE_KEY.txt");
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, "utf8").trim() as Hex;
  }
  return null;
}

export const deployment = loadDeployment();

export const chainId = Number(process.env.CHAIN_ID || deployment?.chainId || 421614);
export const rpcUrl =
  process.env.RPC_URL ||
  process.env.ARB_SEPOLIA_RPC_URL ||
  deployment?.rpcUrl ||
  "https://sepolia-rollup.arbitrum.io/rpc";

export const publicClient: PublicClient = createPublicClient({
  chain: { ...arbitrumSepolia, id: chainId },
  transport: http(rpcUrl)
});

export function getAccount(): Account | null {
  const pk = getPrivateKey();
  if (!pk) return null;
  return privateKeyToAccount(pk);
}

export function getWalletClient(): WalletClient | null {
  const account = getAccount();
  if (!account) return null;
  return createWalletClient({
    account,
    chain: { ...arbitrumSepolia, id: chainId },
    transport: http(rpcUrl)
  });
}

export function requireDeployment(): Deployment {
  if (!deployment) {
    throw new Error(`Missing deployment manifest at ${DEPLOY_PATH}. Run scripts/deploy.sh first.`);
  }
  return deployment;
}
