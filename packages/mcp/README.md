# @shieldedsol/mcp

MCP server exposing [Shielded Sol](https://www.shieldedsol.com) privacy TVL tools to agents (Claude, Cursor, Hermes, etc.).

## Install / run

```bash
npx -y @shieldedsol/mcp
# or
npm install -g @shieldedsol/mcp
shieldedsol-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `list_protocols` | Live TVL for all protocols |
| `get_protocol` | One protocol by slug/name |
| `tvl_history` | Aggregate history (`range`) |
| `protocol_history` | Per-protocol history |
| `health` | API + Turso status |

## Claude Desktop / Cursor config

```json
{
  "mcpServers": {
    "shieldedsol": {
      "command": "npx",
      "args": ["-y", "@shieldedsol/mcp"]
    }
  }
}
```

Optional env:

```bash
SHIELDEDSOL_API_URL=https://www.shieldedsol.com
```

## Hermes Agent

```yaml
mcp_servers:
  shieldedsol:
    command: "npx"
    args: ["-y", "@shieldedsol/mcp"]
```
