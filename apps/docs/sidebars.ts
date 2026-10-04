import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    { type: "category", label: "Start", items: ["start/intro", "start/quickstart"] },
    { type: "category", label: "Use Nectar", items: ["use/operators", "use/makers", "use/keepers"] },
    { type: "category", label: "Protocol", items: ["protocol/registry", "protocol/escrow", "protocol/executor", "protocol/adapter"] },
    { type: "category", label: "PropAMM", items: ["propamm/pricing"] },
    { type: "category", label: "RWA", items: ["rwa/robinhood", "rwa/sequencer"] },
    { type: "category", label: "Build", items: ["build/sdk", "build/api"] },
    { type: "category", label: "Testnet Lab", items: ["lab/local", "lab/sepolia", "lab/robinhood"] },
    { type: "category", label: "Security", items: ["security/model"] },
    { type: "category", label: "Operations", items: ["operations/env", "operations/deploy"] },
    { type: "category", label: "Releases", items: ["releases/addresses"] },
  ],
};

export default sidebars;
