import type { Metadata } from "next";
import { DM_Mono, Syne } from "next/font/google";
import { Providers } from "@/components/AppState";
import "./globals.css";

const sans = Syne({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-sans" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Nectar · testnet rehearsal",
  description: "Hackathon prototype of Nectar liquidation liquidity. Testnet only. Not audited.",
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
