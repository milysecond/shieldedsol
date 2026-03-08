-- ============================================================
-- Shielded Sol — Solana Privacy TVL Dashboard
-- Dune Analytics Queries
-- Dashboard: https://dune.com (create new, paste each query)
-- ============================================================


-- ============================================================
-- QUERY 1: Privacy Cash — Daily Deposit Volume
-- Title: "Privacy Cash — Daily Deposit Volume (SOL)"
-- ============================================================
SELECT
  DATE_TRUNC('day', block_time) AS day,
  COUNT(*) AS deposit_count,
  SUM(native_sol_amount) / 1e9 AS sol_deposited
FROM solana.transactions
WHERE
  account_keys LIKE '%9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD%'
  AND success = TRUE
  AND block_time >= NOW() - INTERVAL '90' DAY
GROUP BY 1
ORDER BY 1 DESC;


-- ============================================================
-- QUERY 2: Privacy Cash — Current SOL Pool Balance
-- Title: "Privacy Cash — SOL Pool TVL"
-- ============================================================
SELECT
  'Privacy Cash' AS protocol,
  'SOL' AS asset,
  account_balance / 1e9 AS balance_sol,
  account_balance / 1e9 * (
    SELECT price FROM prices.usd
    WHERE blockchain = 'solana'
      AND contract_address = 'So11111111111111111111111111111111111111112'
    ORDER BY minute DESC LIMIT 1
  ) AS tvl_usd
FROM solana.account_activity
WHERE address = '4AV2Qzp3N4c9RfzyEbNZs2wqWfW4EwKnnxFAZCndvfGh'
ORDER BY block_time DESC
LIMIT 1;


-- ============================================================
-- QUERY 3: Elusiv — Historical TVL (sunset protocol)
-- Title: "Elusiv — Pool Balance Over Time"
-- ============================================================
SELECT
  DATE_TRUNC('day', block_time) AS day,
  AVG(post_balance) / 1e9 AS sol_balance
FROM solana.account_activity
WHERE address = 'HszJz1zLnYpK5e8TvsRDPSDrxc19qFuhWrFQG6xY2aMX'
  AND block_time >= '2023-01-01'
GROUP BY 1
ORDER BY 1;


-- ============================================================
-- QUERY 4: Vanish Trade — Daily Active Users
-- Title: "Vanish Trade — Daily Unique Depositors"
-- ============================================================
SELECT
  DATE_TRUNC('day', block_time) AS day,
  COUNT(DISTINCT signer) AS unique_users,
  COUNT(*) AS transactions,
  SUM(fee) / 1e9 AS fees_sol
FROM solana.transactions
WHERE
  account_keys LIKE '%8MjKXQgj97NPVNhj9gJrQNP7BibGCGkFMVJ2qZsC58E%'
  AND success = TRUE
  AND block_time >= NOW() - INTERVAL '30' DAY
GROUP BY 1
ORDER BY 1 DESC;


-- ============================================================
-- QUERY 5: Solana Privacy TVL — All Protocols Combined
-- Title: "Total Solana Privacy TVL — All Protocols"
-- (Run this as a combined view using current balances)
-- ============================================================
WITH sol_price AS (
  SELECT price FROM prices.usd
  WHERE blockchain = 'solana'
    AND contract_address = 'So11111111111111111111111111111111111111112'
  ORDER BY minute DESC LIMIT 1
),
privacy_cash_sol AS (
  SELECT account_balance / 1e9 AS balance
  FROM solana.account_activity
  WHERE address = '4AV2Qzp3N4c9RfzyEbNZs2wqWfW4EwKnnxFAZCndvfGh'
  ORDER BY block_time DESC LIMIT 1
),
elusiv_sol AS (
  SELECT account_balance / 1e9 AS balance
  FROM solana.account_activity
  WHERE address = 'HszJz1zLnYpK5e8TvsRDPSDrxc19qFuhWrFQG6xY2aMX'
  ORDER BY block_time DESC LIMIT 1
),
vanish_sol AS (
  SELECT account_balance / 1e9 AS balance
  FROM solana.account_activity
  WHERE address = '8MjKXQgj97NPVNhj9gJrQNP7BibGCGkFMVJ2qZsC58E'
  ORDER BY block_time DESC LIMIT 1
)
SELECT
  'Privacy Cash' AS protocol,
  p.balance AS sol_balance,
  p.balance * s.price AS tvl_usd,
  'live' AS status
FROM privacy_cash_sol p, sol_price s
UNION ALL
SELECT
  'Elusiv' AS protocol,
  e.balance AS sol_balance,
  e.balance * s.price AS tvl_usd,
  'sunset' AS status
FROM elusiv_sol e, sol_price s
UNION ALL
SELECT
  'Vanish Trade' AS protocol,
  v.balance AS sol_balance,
  v.balance * s.price AS tvl_usd,
  'live' AS status
FROM vanish_sol v, sol_price s
ORDER BY tvl_usd DESC;


-- ============================================================
-- QUERY 6: Privacy Protocol Growth — 30-Day Transaction Count
-- Title: "Solana Privacy Protocols — 30D Activity"
-- ============================================================
SELECT
  protocol,
  COUNT(*) AS tx_count,
  COUNT(DISTINCT signer) AS unique_users
FROM (
  SELECT 'Privacy Cash' AS protocol, signer
  FROM solana.transactions
  WHERE account_keys LIKE '%9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD%'
    AND success = TRUE
    AND block_time >= NOW() - INTERVAL '30' DAY
  UNION ALL
  SELECT 'Vanish Trade' AS protocol, signer
  FROM solana.transactions
  WHERE account_keys LIKE '%8MjKXQgj97NPVNhj9gJrQNP7BibGCGkFMVJ2qZsC58E%'
    AND success = TRUE
    AND block_time >= NOW() - INTERVAL '30' DAY
) t
GROUP BY protocol
ORDER BY tx_count DESC;
