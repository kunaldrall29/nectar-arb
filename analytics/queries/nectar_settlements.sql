-- Dune is not connected. There is no DUNE_API_KEY in this prototype.
-- This query is stored only. The API does not send it, and Analytics does not
-- treat its result as a measurement.

SELECT
  block_time,
  tx_hash,
  contract_address
FROM arbitrum.logs
WHERE contract_address = 0x0000000000000000000000000000000000000000
LIMIT 0;
