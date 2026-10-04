---
title: API
---

The protocol API serves `/health`, `/v1/markets`, `/v1/quotes`, `/v1/receipts`, and `/v1/pools`. Amounts are integer strings in base units.

The local process stores jobs and logs in SQLite (`node:sqlite`) because Docker is not available, so Postgres is not running. Restarting the API rescans logs from the manifest start block and does not invent receipts.

The production site `https://nectar-network.vercel.app` still rewrites its API to the operator's local process. This repository does not publish a new public API URL.
