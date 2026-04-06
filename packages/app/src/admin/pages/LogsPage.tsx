import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type AuditLogEntry } from '../api/client'

const PAGE_SIZE = 100

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('ro-RO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function DetailCell({ detail }: { detail: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false)
  const keys = Object.keys(detail)
  if (keys.length === 0) return <span className="text-[var(--muted)]">—</span>

  return (
    <span>
      {expanded ? (
        <span className="font-mono text-xs whitespace-pre-wrap break-all">
          {JSON.stringify(detail, null, 2)}
        </span>
      ) : (
        <span className="font-mono text-xs text-[var(--muted)] truncate max-w-[160px] inline-block align-bottom">
          {JSON.stringify(detail)}
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

function ActionBadge({ action }: { action: string }) {
  const colorMap: Record<string, string> = {
    'content.create':  'text-green-400',
    'content.update':  'text-blue-400',
    'content.delete':  'text-red-400',
    'content.publish': 'text-yellow-400',
    'content.archive': 'text-orange-400',
  }
  const color = colorMap[action] ?? 'text-[var(--muted)]'
  return (
    <span className={`font-mono text-xs tracking-wide ${color}`}>{action}</span>
  )
}

export default function LogsPage() {
  const [offset, setOffset] = useState(0)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-logs', offset],
    queryFn:  () => api.logs.list(PAGE_SIZE, offset),
  })

  const logs: AuditLogEntry[] = data?.logs ?? []
  const hasMore = logs.length === PAGE_SIZE

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Jurnale</h1>
        <span className="text-xs font-content text-[var(--muted)] uppercase tracking-widest">
          Super-admin only
        </span>
      </div>

      {isLoading && (
        <p className="text-[var(--muted)] font-content text-sm">Se încarcă…</p>
      )}
      {isError && (
        <p className="text-red-400 font-content text-sm">Eroare la încărcarea jurnalelor.</p>
      )}

      {!isLoading && !isError && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-content border-collapse" data-testid="logs-table">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal whitespace-nowrap">
                    Data / Ora
                  </th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">
                    Utilizator
                  </th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">
                    Acțiune
                  </th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal whitespace-nowrap">
                    Tip entitate
                  </th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">
                    ID Entitate
                  </th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">
                    Detalii
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-[var(--muted)]">
                      Niciun jurnal înregistrat.
                    </td>
                  </tr>
                )}
                {logs.map(log => (
                  <tr
                    key={log.id}
                    data-testid={`log-row-${log.id}`}
                    className="border-b border-[var(--border)] hover:bg-[var(--surface)] transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-[var(--muted)]">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-sm">{log.userEmail || '—'}</td>
                    <td className="px-3 py-2">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--muted)]">{log.entityType}</td>
                    <td className="px-3 py-2 font-mono text-xs text-[var(--muted)] max-w-[120px] truncate">
                      {log.entityId ?? '—'}
                    </td>
                    <td className="px-3 py-2 max-w-[200px]">
                      <DetailCell detail={log.detail} />
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
