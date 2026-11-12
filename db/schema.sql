-- TVL snapshots table: stores historical TVL data for all protocols
CREATE TABLE IF NOT EXISTS tvl_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  protocol_name TEXT NOT NULL,
  tvl_usd REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient querying by protocol and time range
CREATE INDEX IF NOT EXISTS idx_tvl_protocol_timestamp ON tvl_snapshots(protocol_name, timestamp);

-- Pool balances table: stores granular pool data for each protocol
CREATE TABLE IF NOT EXISTS pool_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  protocol_name TEXT NOT NULL,
  asset TEXT NOT NULL,
  address TEXT,
  balance REAL NOT NULL,
  usd_value REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_pool_protocol_timestamp ON pool_balances(protocol_name, timestamp);
CREATE INDEX IF NOT EXISTS idx_pool_asset_timestamp ON pool_balances(asset, timestamp);

-- Token prices table: stores historical token prices
CREATE TABLE IF NOT EXISTS token_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  symbol TEXT NOT NULL,
  usd_price REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient price queries
CREATE INDEX IF NOT EXISTS idx_price_symbol_timestamp ON token_prices(symbol, timestamp);

-- Helius Privacy Rings public flow index: one row holding the signature
-- cursor + raw per-mint deposit/withdraw totals (see src/lib/helius-rings.ts).
-- Also created lazily by the app (CREATE TABLE IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS helius_rings_flow_index (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  state TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
