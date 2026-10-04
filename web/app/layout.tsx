import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Providers } from "@/components/AppState";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });
const serif = Fraunces({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Nectar · testnet rehearsal",
  description: "Hackathon prototype of Nectar liquidation liquidity. Testnet only. Not audited.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
