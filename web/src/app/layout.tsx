import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { NetworkFilterProvider } from "@/components/NetworkFilter";
import { Shell } from "@/components/Shell";

const inter = Inter({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Nectar — Liquidation Liquidity (Testnet)",
  description: "Funded, time-bounded liquidation bids on Arbitrum & Robinhood Chain testnets.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>
          <NetworkFilterProvider>
            <Shell>{children}</Shell>
          </NetworkFilterProvider>
        </Providers>
      </body>
    </html>
  );
}
