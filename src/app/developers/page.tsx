import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL } from '@/lib/constants';
import MadeByMilysec from '@/components/MadeByMilysec';

export const metadata: Metadata = {
  title: 'Developers — API, MCP & SDK',
  description:
    'Public API, TypeScript SDK, and MCP server for Shielded Sol privacy TVL data.',
  alternates: { canonical: `${SITE_URL}/developers` },
};

const endpoints = [
  { method: 'GET', path: '/api/v1/health', note: 'Health + index' },
  { method: 'GET', path: '/api/v1/protocols', note: 'Live TVL all protocols' },
  {
    method: 'GET',
    path: '/api/v1/protocols/{id}',
    note: 'One protocol (slug or name)',
  },
  {
    method: 'GET',
    path: '/api/v1/history/tvl?range=7d',
    note: 'Aggregate history',
  },
  {
    method: 'GET',
    path: '/api/v1/history/protocol?protocol=Privacy%20Cash&range=30d',
    note: 'Per-protocol history',
  },
  { method: 'GET', path: '/api/v1/openapi.json', note: 'OpenAPI 3.1' },
];

export default function DevelopersPage() {
  return (
    <main className="dev-page">
      <header className="dev-header">
        <a href="/" className="dev-back">
          ← {SITE_NAME}
        </a>
        <h1>Developers</h1>
        <p className="dev-lead">
          Public API, TypeScript SDK, and MCP server for Solana privacy TVL.
        </p>
      </header>

      <section className="dev-section">
        <h2>REST API</h2>
        <p>
          Base:{' '}
          <code>
            {SITE_URL}
          </code>
          · CORS open · no key required
        </p>
        <ul className="dev-list">
          {endpoints.map((e) => (
            <li key={e.path}>
              <code>
                {e.method} {e.path}
              </code>
              <span>{e.note}</span>
            </li>
          ))}
        </ul>
        <pre className="dev-code">{`curl -s ${SITE_URL}/api/v1/protocols | jq .totalTvlUsd`}</pre>
      </section>

      <section className="dev-section">
        <h2>TypeScript SDK</h2>
        <pre className="dev-code">{`npm install @shieldedsol/sdk

import { createClient } from '@shieldedsol/sdk';

const client = createClient();
const { totalTvlUsd, protocols } = await client.listProtocols();
const mb = await client.getProtocol('magicblock');
const hist = await client.tvlHistory('30d');`}</pre>
      </section>

      <section className="dev-section">
        <h2>MCP server</h2>
        <p>For Claude, Cursor, Hermes, and other MCP clients:</p>
        <pre className="dev-code">{`npx -y @shieldedsol/mcp`}</pre>
        <pre className="dev-code">{`{
  "mcpServers": {
    "shieldedsol": {
      "command": "npx",
      "args": ["-y", "@shieldedsol/mcp"]
    }
  }
}`}</pre>
        <p>Tools: list_protocols · get_protocol · tvl_history · protocol_history · health</p>
      </section>

      <footer className="dev-footer">
        <a href="/api/v1/openapi.json">OpenAPI</a>
        <a href="https://github.com/milysecond/shieldedsol">GitHub</a>
        <a href="/">Dashboard</a>
        <MadeByMilysec height={26} />
      </footer>
    </main>
  );
}
