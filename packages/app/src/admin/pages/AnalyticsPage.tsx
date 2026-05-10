import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Period } from '../api/client'
import { PeriodSelector, SiteFilter, StatCard, TrendChart, ItemsTable, ItemDailyModal, SitesComparisonChart } from '../components/analytics'

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('week')
  const [site, setSite] = useState('')
  const [activeMetric, setActiveMetric] = useState<'views' | 'clicks'>('views')
  const [selectedItem, setSelectedItem] = useState<{ id: string; title: string } | null>(null)
  const [startDate, setStartDate] = useState('')
  const queryClient = useQueryClient()

  const siteParam = site || undefined
  const effectivePeriod: Period = startDate ? 'custom' : period
  const startDateParam = startDate || undefined

  const overview = useQuery({
    queryKey: ['admin-analytics-overview', effectivePeriod, site, startDate],
    queryFn: () => api.analytics.overview(period, siteParam, startDateParam),
  })

  const items = useQuery({
    queryKey: ['admin-analytics-items', site],
    queryFn: () => api.analytics.items(siteParam),
  })

  const sitesComparison = useQuery({
    queryKey: ['admin-analytics-sites-comparison', effectivePeriod, startDate],
    queryFn: () => api.analytics.sitesComparison(period, startDateParam),
    enabled: site === '',
  })

  function handlePeriodChange(p: Period) {
    queryClient.removeQueries({ queryKey: ['admin-analytics-overview'] })
    queryClient.removeQueries({ queryKey: ['admin-analytics-sites-comparison'] })
    setPeriod(p)
    setStartDate('')
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="p-6 space-y-8">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Statistici</h1>
        <div className="flex gap-4 items-center flex-wrap">
          <SiteFilter value={site} onChange={setSite} />
          <PeriodSelector value={startDate ? 'custom' : period} onChange={handlePeriodChange} />
          <div className="flex items-center gap-2">
            <label className="text-xs uppercase tracking-widest text-[var(--muted)] font-content">
              De la
            </label>
            <input
              type="date"
              data-testid="start-date-input"
              value={startDate}
              max={today}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1.5 text-xs font-content border border-[var(--border)] bg-transparent text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
            {startDate && (
              <button
                data-testid="clear-start-date"
                onClick={() => {
                  queryClient.removeQueries({ queryKey: ['admin-analytics-overview'] })
                  queryClient.removeQueries({ queryKey: ['admin-analytics-sites-comparison'] })
                  setStartDate('')
                }}
                className="text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                aria-label="Resetează data"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Loading / Error for overview */}
      {overview.isLoading && <p className="text-[var(--muted)] font-content text-sm">Se încarcă…</p>}
      {overview.isError && <p className="text-red-400 font-content text-sm">Eroare la încărcare.</p>}

      {overview.data && (
        <>
          {/* Stat cards */}
          <div className="flex gap-4 flex-wrap">
            <StatCard
              label="Vizualizări"
              value={overview.data.current.views}
              change={overview.data.viewsChange}
              active={activeMetric === 'views'}
              onClick={() => setActiveMetric('views')}
            />
            <StatCard
              label="Clickuri"
              value={overview.data.current.clicks}
              change={overview.data.clicksChange}
              active={activeMetric === 'clicks'}
              onClick={() => setActiveMetric('clicks')}
            />
          </div>

          {/* Trend chart — total views/clicks per day */}
          <TrendChart
            currentSeries={overview.data.current.series}
            previousSeries={overview.data.previous.series}
            metric={activeMetric}
            period={effectivePeriod}
          />

          {/* Sites comparison chart — only shown when viewing all sites */}
          {site === '' && sitesComparison.data && (
            <SitesComparisonChart
              data={sitesComparison.data}
              metric={activeMetric}
              period={effectivePeriod}
            />
          )}
        </>
      )}

      {/* Items table */}
      {items.isLoading && <p className="text-[var(--muted)] font-content text-sm">Se încarcă…</p>}
      {items.isError && <p className="text-red-400 font-content text-sm">Eroare la încărcare.</p>}

      {items.data && (
        <ItemsTable
          items={items.data.items}
          site={siteParam}
          onSelectItem={(id, title) => setSelectedItem({ id, title })}
        />
      )}

      {/* Item daily modal */}
      {selectedItem && (
        <ItemDailyModal
          itemId={selectedItem.id}
          itemTitle={selectedItem.title}
          site={siteParam}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  )
}
