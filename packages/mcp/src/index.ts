#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const API_URL = (process.env.BETEL_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '')
const EMAIL = process.env.BETEL_EMAIL
const PASSWORD = process.env.BETEL_PASSWORD

if (!EMAIL || !PASSWORD) {
  process.stderr.write('BETEL_EMAIL and BETEL_PASSWORD env vars are required\n')
  process.exit(1)
}

let cachedToken: string | null = null
let loginPromise: Promise<string> | null = null

const FETCH_TIMEOUT_MS = 15_000

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
}

async function login(): Promise<string> {
  if (loginPromise) return loginPromise
  loginPromise = (async () => {
    const res = await fetchWithTimeout(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Login failed (${res.status}): ${body}`)
    }
    const { token } = await res.json() as { token: string }
    cachedToken = token
    return token
  })().finally(() => { loginPromise = null })
  return loginPromise
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  if (!cachedToken) await login()

  const doRequest = (tok: string) => fetchWithTimeout(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      'Authorization': `Bearer ${tok}`,
    },
  })

  let res = await doRequest(cachedToken!)
  if (res.status === 401) {
    cachedToken = null
    await login()
    res = await doRequest(cachedToken!)
  }
  return res
}

async function jsonResponse(res: Response): Promise<{ ok: boolean; data: unknown }> {
  const data = await res.json()
  return { ok: res.ok, data }
}

// ──────────────────────────────────────────────────────────────
// Server
// ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'betel-mcp',
  version: '1.0.0',
})

// ── list_sites ────────────────────────────────────────────────

server.tool(
  'list_sites',
  'List all church sites (slugs, names, accent colours). Use slugs when scoping cards to specific sites.',
  {},
  async () => {
    const res = await fetch(`${API_URL}/sites`)
    const data = await res.json()
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  },
)

// ── list_groups ───────────────────────────────────────────────

server.tool(
  'list_groups',
  'List all content groups. Use group IDs when attaching a card to a group.',
  {},
  async () => {
    const res = await apiFetch('/admin/groups')
    const { ok, data } = await jsonResponse(res)
    if (!ok) return { isError: true, content: [{ type: 'text' as const, text: `Error: ${JSON.stringify(data)}` }] }
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  },
)

// ── list_media ────────────────────────────────────────────────

server.tool(
  'list_media',
  'List images in the media library. Use the returned URLs as thumbnail values when creating cards.',
  {},
  async () => {
    const res = await apiFetch('/admin/media')
    const { ok, data } = await jsonResponse(res)
    if (!ok) return { isError: true, content: [{ type: 'text' as const, text: `Error: ${JSON.stringify(data)}` }] }
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  },
)

// ── list_cards ────────────────────────────────────────────────

server.tool(
  'list_cards',
  'List all card content items (including drafts and archived). Returns id, state, data, and site scoping.',
  {},
  async () => {
    const res = await apiFetch('/admin/content')
    const { ok, data } = await jsonResponse(res) as { ok: boolean; data: { items?: unknown[] } }
    if (!ok) return { isError: true, content: [{ type: 'text' as const, text: `Error: ${JSON.stringify(data)}` }] }
    const cards = (data.items ?? []).filter((i: any) => i.type === 'card')
    return { content: [{ type: 'text' as const, text: JSON.stringify(cards, null, 2) }] }
  },
)

// ── create_card ───────────────────────────────────────────────

server.tool(
  'create_card',
  'Create a new card content item (starts as draft). Returns the created item with its ID.',
  {
    title: z.string().describe('Card title (required)'),
    description: z.string().optional().describe('Card body text — supports Markdown'),
    thumbnail: z.string().url().optional().describe('Image URL from the media library'),
    startDate: z.string().optional().describe('Visibility start date, ISO format e.g. 2024-06-01'),
    endDate: z.string().optional().describe('Visibility end date, ISO format e.g. 2024-06-30'),
    link: z.string().url().optional().describe('Primary action URL opened when the card is tapped'),
    cta: z.string().optional().describe('Call-to-action button label, e.g. "Read more"'),
    sites: z.array(z.string()).optional().describe('Site slugs to show this card on; omit or pass [] for all sites'),
    exclusiveSite: z.string().optional().describe('Restrict card to exactly one site (mutually exclusive with sites[])'),
    groupId: z.string().optional().describe('ID of the group to attach this card to'),
  },
  async ({ title, description, thumbnail, startDate, endDate, link, cta, sites, exclusiveSite, groupId }) => {
    const body = {
      type: 'card',
      sites: sites ?? [],
      exclusiveSite: exclusiveSite ?? null,
      groupId: groupId ?? null,
      data: {
        title,
        ...(description !== undefined && { description }),
        ...(thumbnail !== undefined && { thumbnail }),
        ...(startDate !== undefined && { startDate }),
        ...(endDate !== undefined && { endDate }),
        ...(link !== undefined && { link }),
        ...(cta !== undefined && { cta }),
      },
    }

    const res = await apiFetch('/admin/content', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const { ok, data } = await jsonResponse(res)
    if (!ok) return { isError: true, content: [{ type: 'text' as const, text: `Error creating card: ${JSON.stringify(data)}` }] }
    return { content: [{ type: 'text' as const, text: `Card created (draft):\n${JSON.stringify(data, null, 2)}` }] }
  },
)

// ── update_card ───────────────────────────────────────────────

server.tool(
  'update_card',
  'Update fields on an existing card. Only the provided fields are changed.',
  {
    id: z.string().uuid().describe('Card ID to update'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description (Markdown)'),
    thumbnail: z.string().url().optional().describe('New thumbnail URL'),
    startDate: z.string().optional().describe('New start date (ISO)'),
    endDate: z.string().optional().describe('New end date (ISO)'),
    link: z.string().url().optional().describe('New action URL'),
    cta: z.string().optional().describe('New CTA label'),
    sites: z.array(z.string()).optional().describe('New site slugs array'),
    exclusiveSite: z.string().optional().describe('New exclusive site slug; pass empty string to clear'),
  },
  async ({ id, title, description, thumbnail, startDate, endDate, link, cta, sites, exclusiveSite }) => {
    const dataFields: Record<string, unknown> = {}
    if (title !== undefined) dataFields.title = title
    if (description !== undefined) dataFields.description = description
    if (thumbnail !== undefined) dataFields.thumbnail = thumbnail
    if (startDate !== undefined) dataFields.startDate = startDate
    if (endDate !== undefined) dataFields.endDate = endDate
    if (link !== undefined) dataFields.link = link
    if (cta !== undefined) dataFields.cta = cta

    const body: Record<string, unknown> = {}
    if (Object.keys(dataFields).length > 0) body.data = dataFields
    if (sites !== undefined) body.sites = sites
    if (exclusiveSite !== undefined) body.exclusiveSite = exclusiveSite

    const res = await apiFetch(`/admin/content/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    const { ok, data } = await jsonResponse(res)
    if (!ok) return { isError: true, content: [{ type: 'text' as const, text: `Error updating card: ${JSON.stringify(data)}` }] }
    return { content: [{ type: 'text' as const, text: `Card updated:\n${JSON.stringify(data, null, 2)}` }] }
  },
)

// ── publish_card ──────────────────────────────────────────────

server.tool(
  'publish_card',
  'Publish a card (transition from draft → published so it appears on the public site).',
  {
    id: z.string().uuid().describe('Card ID to publish'),
  },
  async ({ id }) => {
    const res = await apiFetch(`/admin/content/${id}/publish`, { method: 'POST' })
    const { ok, data } = await jsonResponse(res)
    if (!ok) return { isError: true, content: [{ type: 'text' as const, text: `Error publishing card: ${JSON.stringify(data)}` }] }
    return { content: [{ type: 'text' as const, text: `Card published:\n${JSON.stringify(data, null, 2)}` }] }
  },
)

// ──────────────────────────────────────────────────────────────
// Start
// ──────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
