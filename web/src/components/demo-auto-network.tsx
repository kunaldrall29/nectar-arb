"use client";

import { useEffect } from "react";
import { isDemoMode } from "@/lib/demo-wallet";
import { useNetwork } from "@/lib/network-context";

/** Demo recordings always target local anvil deployment. */
export function DemoAutoNetwork() {
  const { setSlug } = useNetwork();
  useEffect(() => {
    if (isDemoMode) setSlug("local");
  }, [setSlug]);
  return null;
}
