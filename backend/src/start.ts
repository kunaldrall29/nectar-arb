/** API + keeper agent in one process: `pnpm backend`. */
import { createApi } from "./api";
import { runAgent } from "./agent";

const { app, env } = createApi();
const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`Nectar API on http://localhost:${port}/v1 (${env.net.chain.name})`));
if (process.env.AGENT !== "0") runAgent().catch((e) => console.error("agent stopped:", e));
