"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getJson, type WorkspaceResponse } from "@/lib/api";
import { shortAddr } from "@/lib/format";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export type FilterId = "all" | "arbitrum-sepolia" | "robinhood-testnet";
type Mode = "rehearsal" | "injected";

type Ctx = {
  filter: FilterId;
  setFilter: (filter: FilterId) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  wallet: string | null;
  demoMaker: string | null;
  demoEnabled: boolean;
  data: WorkspaceResponse | null;
  loadError: string | null;
  refresh: () => Promise<void>;
};

const AppCtx = createContext<Ctx | null>(null);

function ethereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { ethereum?: EthereumProvider }).ethereum ?? null;
}

const NAV = [
  ["/", "Overview"],
  ["/markets", "Markets"],
  ["/liquidity", "Liquidity"],
  ["/executions", "Executions"],
  ["/analytics", "Analytics"],
  ["/settings", "Settings"],
] as const;

export function useApp() {
  const value = useContext(AppCtx);
  if (!value) throw new Error("App state missing");
  return value;
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [filter, setFilter] = useState<FilterId>("all");
  const [mode, setMode] = useState<Mode>("rehearsal");
  const [demoMaker, setDemoMaker] = useState<string | null>(null);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [data, setData] = useState<WorkspaceResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [injected, setInjected] = useState<string | null>(null);
  const [injectedChain, setInjectedChain] = useState<number | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("nectar-filter") as FilterId | null;
    if (stored === "all" || stored === "arbitrum-sepolia" || stored === "robinhood-testnet") setFilter(stored);
    const storedMode = window.localStorage.getItem("nectar-mode");
    if (storedMode === "injected" || storedMode === "rehearsal") setMode(storedMode);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("nectar-filter", filter);
  }, [filter]);
  useEffect(() => {
    window.localStorage.setItem("nectar-mode", mode);
  }, [mode]);

  useEffect(() => {
    getJson<{ demo: { enabled: boolean; maker: string | null } }>("/nectar-api/v1/networks")
      .then((body) => {
        setDemoEnabled(body.demo.enabled);
        setDemoMaker(body.demo.maker);
      })
      .catch(() => setDemoEnabled(false));
  }, []);

  const wallet = mode === "injected" ? injected : demoMaker;

  async function connectInjected() {
    const provider = ethereum();
    if (!provider) {
      setConnectError("No injected wallet in this browser. Use the rehearsal signer.");
      return;
    }
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const chainHex = (await provider.request({ method: "eth_chainId" })) as string;
      setInjected(accounts[0] ?? null);
      setInjectedChain(Number.parseInt(chainHex, 16));
      setMode("injected");
      setConnectError(null);
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : "Wallet rejected the connection.");
    }
  }

  async function switchInjected(chainId: number) {
    const provider = ethereum();
    if (!provider) return;
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${chainId.toString(16)}` }],
    });
    setInjectedChain(chainId);
  }

  async function refresh() {
    try {
      const query = wallet ? `?wallet=${wallet}` : "";
      const body = await getJson<WorkspaceResponse>(`/nectar-api/v1/workspace${query}`);
      setData(body);
      setLoadError(body.meta.freshness === "unavailable" ? body.meta.error : null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "The API could not be read.");
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [wallet]);

  const value = useMemo<Ctx>(
    () => ({ filter, setFilter, mode, setMode, wallet, demoMaker, demoEnabled, data, loadError, refresh }),
    [filter, mode, wallet, demoMaker, demoEnabled, data, loadError],
  );

  const connectedChain = data?.meta.chainId;
  const wrongInjected = Boolean(injected && connectedChain && injectedChain && injectedChain !== connectedChain);

  return (
    <AppCtx.Provider value={value}>
      <a className="skip" href="#content">Skip to content</a>
      <div className="frame">
        <aside className="rail">
          <div className="mark">
            <img className="brand-mark" src="/brand/nectar-mark.svg" width={40} height={40} alt="" />
            <img className="brand-mark-compact" src="/brand/nectar-mark-compact.svg" width={24} height={24} alt="" />
            <div>
              <img className="lockup" src="/brand/nectar-lockup.svg" alt="Nectar" />
              <p className="scope-line">Hackathon slice · R1</p>
            </div>
          </div>
          <nav className="nav" aria-label="Primary">
            {NAV.map(([href, label], index) => {
              const active = href === "/" ? path === "/" : path.startsWith(href);
              return (
                <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                  {label}
                  <small>{String(index + 1).padStart(2, "0")}</small>
                </Link>
              );
            })}
          </nav>
          <p className="rail-foot">
            Liquidation liquidity for one rehearsal market. EVM contracts are a new build and are not audited.
          </p>
          <p className="credit">
            Mark and lockup from the{" "}
            <a href="https://nectarnetwork.fun/media-kit">Nectar media kit</a>.
          </p>
        </aside>
        <div className="main">
          <header className="strip">
            <div className="env">
              <span className="pill">Testnet</span>
              <span className="pill neutral">{connectedChain === 31337 ? "Local Anvil rehearsal" : connectedChain === 421614 ? "Arbitrum Sepolia" : "Chain unread"}</span>
              <span className={`pill ${data?.meta.freshness === "live" ? "ok" : "bad"}`}>
                {data?.meta.freshness ?? "loading"}
              </span>
            </div>
            <div className="filters" role="group" aria-label="Network filter">
              {(
                [
                  ["all", "All"],
                  ["arbitrum-sepolia", "Arbitrum Sepolia"],
                  ["robinhood-testnet", "Robinhood testnet"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} className={filter === id ? "on" : ""} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="wallet-box">
              <button className={mode === "rehearsal" ? "solid" : "ghost"} onClick={() => setMode("rehearsal")}>
                Rehearsal signer
              </button>
              {injected ? (
                <button className="ghost" onClick={() => { setInjected(null); setMode("rehearsal"); }}>Disconnect</button>
              ) : (
                <button className="ghost" onClick={() => void connectInjected()}>Connect wallet</button>
              )}
              {injected && (
                <button className={mode === "injected" ? "solid" : "ghost"} onClick={() => setMode("injected")}>
                  Use injected
                </button>
              )}
              <span className="addr">{wallet ? shortAddr(wallet) : "No signer selected"}</span>
            </div>
          </header>
          {wrongInjected && connectedChain && (
            <div className="banner" role="status">
              Injected wallet is on chain {injectedChain}. This deployment expects chain {connectedChain}.
              <button className="ghost" style={{ marginLeft: 8 }} onClick={() => void switchInjected(connectedChain)}>
                Switch network
              </button>
            </div>
          )}
          {connectError && <div className="banner" role="alert">Wallet connection failed. {connectError}</div>}
          <div className="content" id="content">{children}</div>
        </div>
      </div>
    </AppCtx.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <ShellInner>{children}</ShellInner>;
}
