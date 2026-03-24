import { useQuery } from '@tanstack/react-query'
import { api, type LifetimeAnalytics, type DailyAnalytics, type ItemAnalytics } from '../api/client'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ro-RO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
}

export default function AnalyticsPage() {
  const lifetime = useQuery({
    queryKey: ['admin-analytics-lifetime'],
    queryFn: () => api.analytics.lifetime(),
  })

  const daily = useQuery({
    queryKey: ['admin-analytics-daily'],
    queryFn: () => api.analytics.daily(30),
  })

  const items = useQuery({
    queryKey: ['admin-analytics-items'],
    queryFn: () => api.analytics.items(),
  })

  return (
    <div className="p-6 space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Statistici</h1>
      </div>

      {/* ── Lifetime totals ─────────────────────────────────── */}
      <section>
        <h2 className="text-xs uppercase tracking-widest font-content text-[var(--muted)] mb-4">
          Totale generale
        </h2>

        {lifetime.isLoading && <p className="text-[var(--muted)] font-content text-sm">Se încarcă…</p>}
        {lifetime.isError   && <p className="text-red-400 font-content text-sm">Eroare la încărcare.</p>}

        {lifetime.data && (
          <>
            <div className="flex gap-6 mb-6">
              <StatCard label="Vizite site" value={lifetime.data.total.visits} />
              <StatCard label="Clickuri linkuri" value={lifetime.data.total.clicks} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm font-content border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">Locație</th>
                    <th className="text-right px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">Vizite</th>
                    <th className="text-right px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">Clickuri</th>
                  </tr>
                </thead>
                <tbody>
                  {lifetime.data.bySite.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-[var(--muted)]">
                        Nicio activitate înregistrată.
                      </td>
                    </tr>
                  )}
                  {lifetime.data.bySite
                    .sort((a, b) => (b.visits + b.clicks) - (a.visits + a.clicks))
                    .map(row => (
                      <tr key={row.slug ?? '__all__'} className="border-b border-[var(--border)] hover:bg-[var(--surface)] transition-colors">
                        <td className="px-3 py-2">{row.slug ?? <span className="text-[var(--muted)]">Toate locațiile</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.visits.toLocaleString('ro-RO')}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.clicks.toLocaleString('ro-RO')}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ── Clicks per content item ─────────────────────────── */}
      <section>
        <h2 className="text-xs uppercase tracking-widest font-content text-[var(--muted)] mb-4">
          Clickuri per element de conținut
        </h2>

        {items.isLoading && <p className="text-[var(--muted)] font-content text-sm">Se încarcă…</p>}
        {items.isError   && <p className="text-red-400 font-content text-sm">Eroare la încărcare.</p>}

        {items.data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-content border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">Titlu</th>
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">Tip</th>
                  <th className="text-right px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">Clickuri</th>
                </tr>
              </thead>
              <tbody>
                {items.data.items.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-[var(--muted)]">
                      Niciun click înregistrat.
                    </td>
                  </tr>
                )}
                {items.data.items.map(row => (
                  <tr key={row.itemId} className="border-b border-[var(--border)] hover:bg-[var(--surface)] transition-colors">
                    <td className="px-3 py-2">{row.title}</td>
                    <td className="px-3 py-2 font-mono text-xs text-[var(--muted)]">{row.type}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.clicks.toLocaleString('ro-RO')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Daily activity ──────────────────────────────────── */}
      <section>
        <h2 className="text-xs uppercase tracking-widest font-content text-[var(--muted)] mb-4">
          Activitate zilnică (ultimele 30 de zile)
        </h2>

        {daily.isLoading && <p className="text-[var(--muted)] font-content text-sm">Se încarcă…</p>}
        {daily.isError   && <p className="text-red-400 font-content text-sm">Eroare la încărcare.</p>}

        {daily.data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-content border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">Data</th>
                  <th className="text-right px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">Vizite</th>
                  <th className="text-right px-3 py-2 text-xs uppercase tracking-widest text-[var(--muted)] font-normal">Clickuri</th>
                </tr>
              </thead>
              <tbody>
                {daily.data.daily.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-[var(--muted)]">
                      Nicio activitate în ultimele 30 de zile.
                    </td>
                  </tr>
                )}
                {daily.data.daily.map(row => (
                  <tr key={row.date} className="border-b border-[var(--border)] hover:bg-[var(--surface)] transition-colors">
                    <td className="px-3 py-2 text-xs text-[var(--muted)] whitespace-nowrap">{formatDate(row.date)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.visits.toLocaleString('ro-RO')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.clicks.toLocaleString('ro-RO')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] px-6 py-4 min-w-[140px]">
      <p className="text-xs uppercase tracking-widest font-content text-[var(--muted)] mb-1">{label}</p>
      <p className="text-3xl font-bold tabular-nums">{value.toLocaleString('ro-RO')}</p>
    </div>
  )
}
