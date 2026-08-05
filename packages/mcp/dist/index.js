#!/usr/bin/env node

// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
var BASE = (process.env.SHIELDEDSOL_API_URL || "https://www.shieldedsol.com").replace(
  /\/$/,
  ""
);
async function apiGet(path, query) {
  const url = new URL(path, BASE + "/");
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "shieldedsol-mcp/1.0"
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      body?.error || `HTTP ${res.status} ${url}`
    );
  }
  return body;
}
function text(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
  };
}
var server = new McpServer({
  name: "shieldedsol",
  version: "1.0.0"
});
server.registerTool(
  "list_protocols",
  {
    description: "List Solana privacy protocols with live TVL (USD), pools, and status from Shielded Sol."
  },
  async () => text(await apiGet("/api/v1/protocols"))
);
server.registerTool(
  "get_protocol",
  {
    description: "Get one protocol by name or slug (e.g. magicblock, privacy-cash, Umbra).",
    inputSchema: {
      id: z.string().describe("Protocol name or slug")
    }
  },
  async ({ id }) => text(await apiGet(`/api/v1/protocols/${encodeURIComponent(id)}`))
);
server.registerTool(
  "tvl_history",
  {
    description: "Aggregate total TVL history across all protocols.",
    inputSchema: {
      range: z.enum(["1h", "6h", "24h", "7d", "30d", "90d"]).default("7d").describe("History window")
    }
  },
  async ({ range }) => text(await apiGet("/api/v1/history/tvl", { range: range || "7d" }))
);
server.registerTool(
  "protocol_history",
  {
    description: "TVL history for a single protocol name (exact display name preferred).",
    inputSchema: {
      protocol: z.string().describe("Protocol display name, e.g. Privacy Cash"),
      range: z.enum(["1h", "6h", "24h", "7d", "30d", "90d"]).default("7d").describe("History window")
    }
  },
  async ({ protocol, range }) => text(
    await apiGet("/api/v1/history/protocol", {
      protocol,
      range: range || "7d"
    })
  )
);
server.registerTool(
  "health",
  {
    description: "Shielded Sol API health, Turso history DB status, and endpoint index."
  },
  async () => text(await apiGet("/api/v1/health"))
);
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
