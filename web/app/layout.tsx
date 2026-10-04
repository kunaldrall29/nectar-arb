import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Frame } from "@/components/Frame";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Nectar · testnet",
  description: "Funded liquidity for onchain liquidations. Testnet. Not audited.",
  icons: { icon: "/brand/nectar-mark.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={sans.variable}>
        <Frame>{children}</Frame>
      </body>
    </html>
  );
}
