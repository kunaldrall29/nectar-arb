import { config, loadNetworks } from "./config.js";
import { indexOnce } from "./indexer.js";
import { startKeeper, releaseExpiredQuotes } from "./keeper.js";
import { log } from "./log.js";
import { startServer } from "./server.js";

async function main() {
  const networks = loadNetworks();
  if (!networks.length) {
    log.warn("No deployments/*.json manifests — API will serve empty state until deploy.");
  }

  const indexLoop = async () => {
    for (const n of networks) await indexOnce(n);
    for (const n of networks) await releaseExpiredQuotes(n).catch(() => {});
  };
  setInterval(indexLoop, config.pollMs);
  await indexLoop();

  startKeeper(networks);
  await startServer();
  log.info(`Nectar backend on :${config.port} (${networks.length} network(s))`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
