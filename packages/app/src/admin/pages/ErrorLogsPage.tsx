import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type ErrorLogEntry } from '../api/client'

const PAGE_SIZE = 50

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('ro-RO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function ExpandableCell({ text, maxWidth = 200 }: { text: string; maxWidth?: number }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return <span className="text-[var(--muted)]">—</span>

  return (
    <span>
      {expanded ? (
        <span className="font-mono text-xs whitespace-pre-wrap break-all">{text}</span>
      ) : (
        <span
          className="font-mono text-xs text-[var(--muted)] truncate inline-block align-bottom"
          style={{ maxWidth }}>
          {text}
        </span>
      )}
      <button
        onClick={() => setExpanded(v => !v)}
        className="ml-1 text-[10px] uppercase tracking-widest font-content text-[var(--accent)] hover:underline">
        {expanded ? 'Mai puțin' : 'Mai mult'}
      </button>
    </span>
  )
}

function DeviceCell({ device }: { device: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false)
  const ua = device.userAgent as string | undefined
  if (!ua && Object.keys(device).length === 0) return <span className="text-[var(--muted)]">—</span>

  return (
    <span>
      {expanded ? (
        <span className="font-mono text-xs whitespace-pre-wrap break-all">
          {JSON.stringify(device, null, 2)}
        </span>
      ) : (
        <span className="font-mono text-xs text-[var(--muted)] truncate max-w-[160px] inline-block align-bottom">
          {ua ?? JSON.stringify(device)}
        </span>
      )}
      <button
        onClick={() => setExpanded(v => !v)}
        className="ml-1 text-[10px] uppercase tracking-widest font-content text-[var(--accent)] hover:underline">
        {expanded ? 'Mai puțin' : 'Mai mult'}
      </button>
    </span>
  )
}

export default function ErrorLogsPage() {
  const [offset, setOffset] = useState(0)
  const [siteFilter, setSiteFilter] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-error-logs', offset, siteFilter],
    queryFn:  () => api.errorLogs.list(PAGE_SIZE, offset, siteFilter || undefined),
  })

  const logs: ErrorLogEntry[] = data?.errorLogs ?? []
  const hasMore = logs.length === PAGE_SIZE

  function handleSiteFilter(e: React.ChangeEvent<HTMLInputElement>) {
    setSiteFilter(e.target.value)
    setOffset(0)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Erori aplicație</h1>
        <span className="text-xs font-content text-[var(--muted)] uppercase tracking-widest">
          Super-admin only
        </span>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Filtrează după site (slug)…"
          value={siteFilter}
          onChange={handleSiteFilter}
          className="border border-[var(--border)] bg-transparent text-base font-content px-3 py-1.5
                     placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]
                     transition-colors w-64"
        />
      </div>

      {isLoading && (
        <p className="text-[var(--muted)] font-content text-sm">Se încarcă…</p>
      )}
      {isError && (
        <p className="text-red-400 font-content text-sm">Eroare la încărcarea jurnalului de erori.</p>
      )}

      {!isLoading && !isError && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-content border-collapse" data-testid="error-logs-table">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal whitespace-nowrap">
                    Data / Ora
                  </th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">
                    Site
                  </th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">
                    URL
                  </th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">
                    Mesaj
                  </th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">
                    Stack
                  </th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">
                    Dispozitiv
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-[var(--muted)]">
                      Nicio eroare înregistrată.
                    </td>
                  </tr>
                )}
                {logs.map(log => (
                  <tr
                    key={log.id}
                    data-testid={`error-log-row-${log.id}`}
                    className="border-b border-[var(--border)] hover:bg-[var(--surface)] transition-colors align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-[var(--muted)]">
                      {formatDate(log.occurredAt)}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--muted)]">
                      {log.siteSlug ?? '—'}
                    </td>
                    <td className="px-3 py-2 max-w-[180px]">
                      <ExpandableCell text={log.url ?? ''} maxWidth={160} />
                    </td>
                    <td className="px-3 py-2 max-w-[240px]">
                      <ExpandableCell text={log.message} maxWidth={220} />
                    </td>
                    <td className="px-3 py-2 max-w-[240px]">
                      <ExpandableCell text={log.stack ?? ''} maxWidth={220} />
                    </td>
                    <td className="px-3 py-2 max-w-[200px]">
                      <DeviceCell device={log.device} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-4 mt-4">
            <button
              onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
              disabled={offset === 0}
              className="px-4 py-2 border border-[var(--border)] text-xs tracking-widest uppercase font-content
                         hover:border-[var(--accent)] transition-colors disabled:opacity-30">
              ← Anterior
            </button>
            <span className="text-xs font-content text-[var(--muted)]">
              {offset + 1}–{offset + logs.length}
            </span>
            <button
              onClick={() => setOffset(o => o + PAGE_SIZE)}
              disabled={!hasMore}
              className="px-4 py-2 border border-[var(--border)] text-xs tracking-widest uppercase font-content
                         hover:border-[var(--accent)] transition-colors disabled:opacity-30">
              Următor →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
