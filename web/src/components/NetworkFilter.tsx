"use client";

import { createContext, useContext, useState } from "react";
import type { Family } from "@/lib/data";

const Ctx = createContext<{ family: Family; setFamily: (f: Family) => void }>({
  family: "all",
  setFamily: () => {},
});

export function NetworkFilterProvider({ children }: { children: React.ReactNode }) {
  const [family, setFamily] = useState<Family>("all");
  return <Ctx.Provider value={{ family, setFamily }}>{children}</Ctx.Provider>;
}

export function useNetworkFilter() {
  return useContext(Ctx);
}

export function NetworkFilter({ value, onChange }: { value: Family; onChange: (f: Family) => void }) {
  const opts: { id: Family; label: string }[] = [
    { id: "all", label: "All networks" },
    { id: "arbitrum", label: "Arbitrum" },
    { id: "robinhood", label: "Robinhood Chain" },
  ];
  return (
    <div className="flex rounded-lg border border-nectar-border bg-nectar-panel p-0.5 text-xs">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={
            value === o.id
              ? "rounded-md bg-slate-700 px-2 py-1 text-white"
              : "px-2 py-1 text-slate-400 hover:text-white"
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
