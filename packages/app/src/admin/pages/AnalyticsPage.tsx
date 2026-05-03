import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type Period } from '../api/client'
import { PeriodSelector, SiteFilter, StatCard, TrendChart, ItemsTable, ItemDailyModal, SitesComparisonChart } from '../components/analytics'

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('week')
  const [site, setSite] = useState('')
  const [activeMetric, setActiveMetric] = useState<'views' | 'clicks'>('views')
  const [selectedItem, setSelectedItem] = useState<{ id: string; title: string } | null>(null)

  const siteParam = site || undefined

  const overview = useQuery({
    queryKey: ['admin-analytics-overview', period, site],
    queryFn: () => api.analytics.overview(period, siteParam),
  })

  const items = useQuery({
    queryKey: ['admin-analytics-items', site],
    queryFn: () => api.analytics.items(siteParam),
  })

  const sitesComparison = useQuery({
    queryKey: ['admin-analytics-sites-comparison', period],
    queryFn: () => api.analytics.sitesComparison(period),
    enabled: site === '',
  })

  return (
    <div className="p-6 space-y-8">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Statistici</h1>
        <div className="flex gap-4 items-center">
          <SiteFilter value={site} onChange={setSite} />
          <PeriodSelector value={period} onChange={setPeriod} />
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
            period={period}
          />

          {/* Sites comparison chart — only shown when viewing all sites */}
          {site === '' && sitesComparison.data && (
            <SitesComparisonChart
              data={sitesComparison.data}
              metric={activeMetric}
              period={period}
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
