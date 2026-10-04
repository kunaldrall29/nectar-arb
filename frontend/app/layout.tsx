import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/Shell";

const geist = DM_Sans({
  subsets: ["latin"],
  variable: "--font-geist",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: "Nectar — liquidation liquidity",
  description:
    "Funded, time-bounded bids for eligible liquidations. Live on Stellar testnet. Same product on Arbitrum and Robinhood Chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${fraunces.variable} font-sans antialiased`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
