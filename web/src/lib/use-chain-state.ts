"use client";

import { EventCache, readChainState, type ChainState } from "@nectar/core";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import { useMemo } from "react";
import { useNetwork } from "./network-context";
import { clientRpcUrl } from "./rpc-url";

export function useChainState() {
  const { net } = useNetwork();
  const d = net.deployment;

  const client = useMemo(() => {
    if (!d) return undefined;
    return createPublicClient({ chain: net.chain, transport: http(clientRpcUrl(net), { retryCount: 2 }) });
  }, [net, d]);

  const cache = useMemo(() => {
    if (!client || !d) return undefined;
    return new EventCache(client, d, { chunk: net.logChunk, reorgWindow: 12 });
  }, [client, d, net.logChunk]);

  return useQuery({
    queryKey: ["chainState", net.slug, d?.executor],
    enabled: !!client && !!d && !!cache,
    refetchInterval: 4000,
    queryFn: async (): Promise<ChainState> => readChainState(client!, d!, cache!),
  });
}

export function usePublicClient() {
  const { net } = useNetwork();
  return useMemo(
    () => createPublicClient({ chain: net.chain, transport: http(clientRpcUrl(net), { retryCount: 2 }) }),
    [net],
  );
}
