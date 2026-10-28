// MCP parity check (spec 05 §9, FR-084): connects to the stdio server (spawns the
// bundled dist/index.js) and to the remote /mcp endpoint, then
//   - always: diffs tools/list (name, description, inputSchema, annotations);
//   - with --calls: calls the read-only analytics tools and list_short_links with a
//     fixed input set on both transports and deep-compares the parsed JSON.
// Exits 1 on the first difference. Write tools are never called.
//
// Env: BETEL_MCP_URL (e.g. http://localhost:3100/mcp), MCP_SECRET, and the stdio
// server's BETEL_EMAIL / BETEL_PASSWORD / BETEL_API_URL. Both surfaces must use the
// same database. Optional PARITY_ITEM_ID / PARITY_CODE pin the item and short link
// used by --calls; otherwise they are discovered from the remote surface.
//
// Usage: pnpm --filter @betel/mcp build && pnpm --filter @betel/mcp parity [--calls]

import { deepStrictEqual } from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const remoteUrl = process.env.BETEL_MCP_URL
const secret = process.env.MCP_SECRET
const withCalls = process.argv.includes('--calls')

if (!remoteUrl || !secret) {
  process.stderr.write('BETEL_MCP_URL and MCP_SECRET env vars are required\n')
  process.exit(2)
}

const here = dirname(fileURLToPath(import.meta.url))
const stdioEntry = join(here, '..', 'dist', 'index.js')

function fail(message: string): never {
  process.stderr.write(`PARITY FAILED: ${message}\n`)
  process.exit(1)
}

// Recursively sorts object keys so key order is not part of the comparison.
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, normalize((value as Record<string, unknown>)[k])]))
  }
  return value
}

function compare(label: string, stdio: unknown, remote: unknown): void {
  try {
    deepStrictEqual(normalize(stdio), normalize(remote))
  } catch (e) {
    fail(`${label}\n${(e as Error).message}`)
  }
}

type CallResult = { isError?: boolean; content?: { type: string; text?: string }[] }

function parse(label: string, result: CallResult): unknown {
  const text = result.content?.[0]?.text ?? ''
  if (result.isError) return { error: text }
  try {
    return JSON.parse(text)
  } catch {
    fail(`${label}: response is not JSON: ${text.slice(0, 200)}`)
  }
}

async function main() {
  const stdio = new Client({ name: 'betel-parity', version: '1.0.0' })
  await stdio.connect(new StdioClientTransport({
    command: process.execPath,
    args: [stdioEntry],
    env: { ...process.env } as Record<string, string>,
    stderr: 'inherit',
  }))

  const remote = new Client({ name: 'betel-parity', version: '1.0.0' })
  await remote.connect(new StreamableHTTPClientTransport(new URL(remoteUrl!), {
    requestInit: { headers: { Authorization: `Bearer ${secret}` } },
  }))

  try {
    // ── Schema parity ──
    const [a, b] = await Promise.all([stdio.listTools(), remote.listTools()])
    const shape = (tools: typeof a.tools) => tools
      .map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations }))
      .sort((x, y) => x.name.localeCompare(y.name))
    compare('tools/list differs between stdio and remote', shape(a.tools), shape(b.tools))
    process.stdout.write(`schema parity OK (${a.tools.length} tools)\n`)

    if (!withCalls) return

    // ── Response parity ──
    const call = async (client: Client, name: string, args: Record<string, unknown>) =>
      parse(`${name} ${JSON.stringify(args)}`, await client.callTool({ name, arguments: args }) as CallResult)

    let itemId = process.env.PARITY_ITEM_ID
    let code = process.env.PARITY_CODE
    if (!code || !itemId) {
      const listed = await call(remote, 'list_short_links', { limit: 1 }) as { shortLinks?: { code: string; contentItemId: string }[] }
      code ??= listed.shortLinks?.[0]?.code
      itemId ??= listed.shortLinks?.[0]?.contentItemId
    }
    if (!itemId) {
      const top = await call(remote, 'get_top_items', { from: '2026-01-01', to: '2026-10-28' }) as { items?: { itemId: string }[] }
      itemId = top.items?.[0]?.itemId
    }

    const dst = { from: '2026-10-25', to: '2026-10-26' }
    const cases: [string, Record<string, unknown>][] = [
      ['get_analytics_overview', {}],
      ['get_analytics_overview', dst],
      ['get_analytics_overview', { ...dst, tz: 'UTC' }],
      ['get_analytics_overview', { ...dst, compare: false, granularity: 'week' }],
      ['get_analytics_overview', { from: '2026-09-01', to: '2026-10-28', granularity: 'week' }],
      ['get_analytics_overview', { ...dst, tz: '+02:00' }],
      ['get_top_items', {}],
      ['get_top_items', { ...dst, limit: 2 }],
      ['get_short_link_stats', {}],
      ['list_short_links', {}],
      ['list_short_links', { limit: 2 }],
    ]
    if (itemId) {
      cases.push(
        ['get_item_stats', { itemId }],
        ['get_item_stats', { itemId, ...dst }],
        ['get_item_stats', { itemId, ...dst, tz: 'UTC' }],
        ['get_item_stats', { itemId, from: '2026-09-01', to: '2026-10-28', granularity: 'week' }],
        ['get_short_link_stats', { itemId }],
        ['list_short_links', { itemId }],
      )
    } else {
      process.stdout.write('no item with clicks or short links found: item cases skipped\n')
    }
    if (code) cases.push(['get_short_link_stats', { code, ...dst }], ['get_short_link_stats', { code }])

    for (const [name, args] of cases) {
      const [x, y] = await Promise.all([call(stdio, name, args), call(remote, name, args)])
      compare(`${name} ${JSON.stringify(args)}`, x, y)
    }
    process.stdout.write(`response parity OK (${cases.length} calls)\n`)
  } finally {
    await Promise.allSettled([stdio.close(), remote.close()])
  }
}

main().catch(e => fail((e as Error).stack ?? String(e)))
