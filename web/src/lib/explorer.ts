import type { NetworkInfo } from "@nectar/core";
import { explorerAddress as coreExplorerAddress, explorerTx as coreExplorerTx } from "@nectar/core";

export function explorerTx(net: NetworkInfo, hash: string) {
  return coreExplorerTx(net, hash);
}

export function explorerAddress(net: NetworkInfo, addr: string) {
  return coreExplorerAddress(net, addr) ?? `#`;
}
