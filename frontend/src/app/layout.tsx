import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nectar — Liquidation liquidity that settles",
  description:
    "Funded bids, atomic liquidation settlement, and one workspace for makers, keepers, and market operators.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
