import { isDemoMode } from "./demo-wallet";
import type { NetworkInfo } from "@nectar/core";

export function clientRpcUrl(net: NetworkInfo): string {
  if (typeof window !== "undefined" && (isDemoMode || net.slug === "local")) {
    return `${window.location.origin}/api/rpc`;
  }
  return net.chain.rpcUrls.default.http[0];
}
