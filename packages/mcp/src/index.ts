#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { toolContract, toolNames, type ToolHandlers, type ToolResult } from '@betel/shared/mcp-tools'

const apiUrl = (process.env.BETEL_API_URL || 'http://localhost:3100/api').replace(/\/$/, '')
const email = process.env.BETEL_EMAIL
const password = process.env.BETEL_PASSWORD

if (!email || !password) {
  process.stderr.write('BETEL_EMAIL and BETEL_PASSWORD env vars are required\n')
  process.exit(1)
}

let cachedToken: string | null = null
let loginPromise: Promise<string> | null = null

const fetchTimeoutMs = 15_000

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...options, signal: AbortSignal.timeout(fetchTimeoutMs) })
}

async function login(): Promise<string> {
  if (loginPromise) return loginPromise
  loginPromise = (async () => {
    const res = await fetchWithTimeout(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
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

  const doRequest = (tok: string) => fetchWithTimeout(`${apiUrl}${path}`, {
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

async function apiFetchFormData(path: string, formData: FormData): Promise<Response> {
  if (!cachedToken) await login()

  const doRequest = (tok: string) => fetchWithTimeout(`${apiUrl}${path}`, {
    method: 'POST',
    body: formData,
    headers: { 'Authorization': `Bearer ${tok}` },
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
  try {
    const data = await res.json()
    return { ok: res.ok, data }
  } catch {
    const text = await res.text().catch(() => '')
    return { ok: res.ok, data: text || null }
  }
}

// ──────────────────────────────────────────────────────────────
// Tool handlers — schemas and descriptions come from the shared contract
// (@betel/shared/mcp-tools, ADR-024); every handler calls the REST API.
// ──────────────────────────────────────────────────────────────

function text(value: string, isError = false): ToolResult {
  return { ...(isError && { isError: true }), content: [{ type: 'text', text: value }] }
}

function errorText(prefix: string, data: unknown): ToolResult {
  return text(`${prefix}: ${JSON.stringify(data)}`, true)
}

// Query string from tool arguments, skipping undefined values.
function query(params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v))
  const s = qs.toString()
  return s ? `?${s}` : ''
}

// Spec 05 tools: the REST body is the tool output, untouched; a REST `{ error }` is the
// tool error text verbatim, so messages match the remote surface (§6.8).
async function passThrough(res: Response): Promise<ToolResult> {
  const { ok, data } = await jsonResponse(res)
  if (ok) return text(JSON.stringify(data, null, 2))
  const message = data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
    ? (data as { error: string }).error
    : `Error: ${res.status} ${typeof data === 'string' ? data : JSON.stringify(data)}`
  return text(message, true)
}

const handlers: ToolHandlers = {
  list_sites: async () => {
    const res = await apiFetch('/sites')
    const { ok, data } = await jsonResponse(res)
    if (!ok) return errorText('Error', data)
    return text(JSON.stringify(data, null, 2))
  },

  list_groups: async () => {
    const res = await apiFetch('/admin/groups')
    const { ok, data } = await jsonResponse(res)
    if (!ok) return errorText('Error', data)
    return text(JSON.stringify(data, null, 2))
  },

  list_media: async () => {
    const res = await apiFetch('/admin/media')
    const { ok, data } = await jsonResponse(res)
    if (!ok) return errorText('Error', data)
    return text(JSON.stringify(data, null, 2))
  },

  upload_media: async ({ imageData, filename, mimeType }) => {
    const resolvedMime = mimeType ?? 'image/jpeg'
    if (!resolvedMime.startsWith('image/')) {
      return text(`Unsupported mimeType "${resolvedMime}". Only image/* types are accepted.`, true)
    }
    const buffer = Buffer.from(imageData, 'base64')
    const blob = new Blob([buffer], { type: resolvedMime })
    const formData = new FormData()
    const mimeExtMap: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
      'image/webp': 'webp', 'image/avif': 'avif', 'image/tiff': 'tiff',
    }
    const ext = mimeExtMap[resolvedMime] ?? resolvedMime.split('/')[1] ?? 'bin'
    const uploadFilename = filename ?? `upload.${ext}`
    formData.append('file', blob, uploadFilename)

    const res = await apiFetchFormData('/admin/media', formData)
    const { ok, data } = await jsonResponse(res)
    if (!ok) return errorText('Error uploading media', data)
    return text(`Media uploaded:\n${JSON.stringify(data, null, 2)}`)
  },

  list_cards: async () => {
    const res = await apiFetch('/admin/content')
    const { ok, data } = await jsonResponse(res) as { ok: boolean; data: { items?: unknown[] } }
    if (!ok) return errorText('Error', data)
    const cards = (data.items ?? []).filter((i: any) => i.type === 'card')
    return text(JSON.stringify(cards, null, 2))
  },

  create_card: async ({ title, description, thumbnail, startDate, endDate, startTime, location, link, cta, sites, exclusiveSite, groupId }) => {
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
        ...(startTime !== undefined && { startTime }),
        ...(location !== undefined && { location }),
        ...(link !== undefined && { link }),
        ...(cta !== undefined && { cta }),
      },
    }

    const res = await apiFetch('/admin/content', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const { ok, data } = await jsonResponse(res)
    if (!ok) return errorText('Error creating card', data)
    return text(`Card created (draft):\n${JSON.stringify(data, null, 2)}`)
  },

  update_card: async ({ id, title, description, thumbnail, startDate, endDate, startTime, location, link, cta, sites, exclusiveSite }) => {
    const dataFields: Record<string, unknown> = {}
    if (title !== undefined) dataFields.title = title
    if (description !== undefined) dataFields.description = description
    if (thumbnail !== undefined) dataFields.thumbnail = thumbnail
    if (startDate !== undefined) dataFields.startDate = startDate
    if (endDate !== undefined) dataFields.endDate = endDate
    if (startTime !== undefined) dataFields.startTime = startTime // null clears it on the API
    if (location !== undefined) dataFields.location = location // null clears it; the API validates it
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
    if (!ok) return errorText('Error updating card', data)
    return text(`Card updated:\n${JSON.stringify(data, null, 2)}`)
  },

  publish_card: async ({ id }) => {
    const res = await apiFetch(`/admin/content/${id}/publish`, { method: 'POST' })
    const { ok, data } = await jsonResponse(res)
    if (!ok) return errorText('Error publishing card', data)
    return text(`Card published:\n${JSON.stringify(data, null, 2)}`)
  },

  // ── Analytics and short links (spec 05): REST pass-throughs ──

  get_analytics_overview: async ({ from, to, tz, site, granularity, compare }) =>
    passThrough(await apiFetch(`/admin/analytics/range${query({ from, to, tz, site, granularity, compare })}`)),

  get_item_stats: async ({ itemId, from, to, tz, site, granularity, compare }) =>
    passThrough(await apiFetch(`/admin/analytics/items/${encodeURIComponent(itemId)}/stats${query({ from, to, tz, site, granularity, compare })}`)),

  get_top_items: async ({ from, to, tz, site, type, limit }) =>
    passThrough(await apiFetch(`/admin/analytics/top-items${query({ from, to, tz, site, type, limit })}`)),

  get_short_link_stats: async ({ code, itemId, from, to, tz, granularity }) =>
    passThrough(await apiFetch(`/admin/analytics/short-links${query({ code, itemId, from, to, tz, granularity })}`)),

  create_short_link: async ({ itemId, label, siteSlug }) =>
    passThrough(await apiFetch(`/admin/content/${encodeURIComponent(itemId)}/short-links`, {
      method: 'POST',
      body: JSON.stringify({ label, siteSlug: siteSlug ?? null }),
    })),

  list_short_links: async ({ itemId, site, limit }) =>
    passThrough(await apiFetch(`/admin/short-links${query({ itemId, site, limit })}`)),
}

// ──────────────────────────────────────────────────────────────
// Server
// ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'betel-mcp',
  version: '1.0.0',
})

// A tool exists on both surfaces or on neither: register every contract entry (ADR-024).
for (const name of toolNames) {
  const tool = toolContract[name]
  server.registerTool(
    name,
    { description: tool.description, inputSchema: tool.input, annotations: tool.annotations },
    handlers[name] as never,
  )
}

// ──────────────────────────────────────────────────────────────
// Start
// ──────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
