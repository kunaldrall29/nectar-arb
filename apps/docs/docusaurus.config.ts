import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Nectar",
  tagline: "Funded liquidity for onchain liquidations",
  favicon: "img/favicon.svg",
  url: "https://nectar-network.vercel.app",
  baseUrl: "/",
  organizationName: "kunaldrall29",
  projectName: "nectar-arb",
  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",
  markdown: { hooks: { onBrokenMarkdownLinks: "throw" } },
  i18n: { defaultLocale: "en", locales: ["en"] },
  presets: [
    [
      "classic",
      {
        docs: { sidebarPath: "./sidebars.ts", routeBasePath: "/" },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    navbar: { title: "Nectar docs", items: [{ to: "/start/quickstart", label: "Quickstart", position: "left" }] },
    footer: { style: "light", copyright: "Testnet documentation. Not an audit." },
  } satisfies Preset.ThemeConfig,
};

export default config;
