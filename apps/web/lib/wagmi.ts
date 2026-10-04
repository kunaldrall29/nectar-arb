import { http, defineChain, createPublicClient, createWalletClient, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createConfig, createConnector, type CreateConnectorFn } from "wagmi";
import { injected } from "wagmi/connectors";

export const arbitrumSepolia = defineChain({
  id: 421614,
  name: "Arbitrum Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia-rollup.arbitrum.io/rpc"] } },
  blockExplorers: { default: { name: "Arbiscan", url: "https://sepolia.arbiscan.io" } },
  testnet: true,
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ROBINHOOD_RPC || "https://46630.rpc.thirdweb.com"] } },
  testnet: true,
});

export const anvil = defineChain({
  id: 31337,
  name: "Local Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ANVIL_RPC || "http://127.0.0.1:8545"] } },
  testnet: true,
});

function demoConnector(): CreateConnectorFn {
  return createConnector((config) => ({
    id: "nectar-demo",
    name: "Nectar rehearsal wallet",
    type: "nectar-demo",
    async setup() {},
    async connect() {
      const key = localStorage.getItem("nectar.demoKey") as Hex | null;
      if (!key) throw new Error("No rehearsal key. Open Settings and load the demo signer.");
      const account = privateKeyToAccount(key);
      const chainId = Number(localStorage.getItem("nectar.chainId") || config.chains[0].id);
      return { accounts: [account.address], chainId };
    },
    async disconnect() {},
    async getAccounts() {
      const key = localStorage.getItem("nectar.demoKey") as Hex | null;
      return key ? [privateKeyToAccount(key).address] : [];
    },
    async getChainId() {
      return Number(localStorage.getItem("nectar.chainId") || config.chains[0].id);
    },
    async isAuthorized() {
      return Boolean(localStorage.getItem("nectar.demoKey"));
    },
    async getProvider() {
      const key = localStorage.getItem("nectar.demoKey") as Hex | null;
      if (!key) throw new Error("missing key");
      const account = privateKeyToAccount(key);
      const chain =
        config.chains.find((c) => c.id === Number(localStorage.getItem("nectar.chainId") || config.chains[0].id)) ||
        config.chains[0];
      const wallet = createWalletClient({ account, chain, transport: http(chain.rpcUrls.default.http[0]) });
      const pub = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });
      return {
        on() {},
        removeListener() {},
        async request({ method, params }: { method: string; params?: unknown[] }) {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [account.address];
          if (method === "eth_chainId") return `0x${chain.id.toString(16)}`;
          if (method === "personal_sign") {
            return account.signMessage({ message: { raw: (params?.[0] as Hex) || "0x" } });
          }
          if (method === "eth_signTypedData_v4") {
            const payload = JSON.parse(String(params?.[1] || "{}"));
            return account.signTypedData(payload);
          }
          if (method === "eth_sendTransaction") {
            const tx = (params?.[0] || {}) as {
              to?: Hex;
              data?: Hex;
              value?: Hex;
            };
            return wallet.sendTransaction({
              to: tx.to,
              data: tx.data,
              value: tx.value ? BigInt(tx.value) : undefined,
            });
          }
          if (method === "wallet_switchEthereumChain") {
            const id = Number((params?.[0] as { chainId?: string })?.chainId);
            if (id) localStorage.setItem("nectar.chainId", String(id));
            return null;
          }
          return pub.request({ method: method as "eth_blockNumber", params: params as [] });
        },
      };
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }));
}

export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia, robinhoodTestnet, anvil],
  connectors: [injected(), demoConnector()],
  transports: {
    [arbitrumSepolia.id]: http(arbitrumSepolia.rpcUrls.default.http[0]),
    [robinhoodTestnet.id]: http(robinhoodTestnet.rpcUrls.default.http[0]),
    [anvil.id]: http(anvil.rpcUrls.default.http[0]),
  },
  ssr: true,
});
