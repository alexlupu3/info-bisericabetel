import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type Period } from '../api/client'
import { PeriodSelector, StatCard, TrendChart, ItemsTable, ItemDailyModal } from '../components/analytics'

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('week')
  const [activeMetric, setActiveMetric] = useState<'views' | 'clicks'>('views')
  const [selectedItem, setSelectedItem] = useState<{ id: string; title: string } | null>(null)

  const overview = useQuery({
    queryKey: ['admin-analytics-overview', period],
    queryFn: () => api.analytics.overview(period),
  })

  const items = useQuery({
    queryKey: ['admin-analytics-items'],
    queryFn: () => api.analytics.items(),
  })

  return (
    <div className="p-6 space-y-8">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Statistici</h1>
        <PeriodSelector value={period} onChange={setPeriod} />
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

          {/* Trend chart */}
          <TrendChart
            currentSeries={overview.data.current.series}
            previousSeries={overview.data.previous.series}
            metric={activeMetric}
            period={period}
          />
        </>
      )}

      {/* Items table */}
      {items.isLoading && <p className="text-[var(--muted)] font-content text-sm">Se încarcă…</p>}
      {items.isError && <p className="text-red-400 font-content text-sm">Eroare la încărcare.</p>}

      {items.data && (
        <ItemsTable
          items={items.data.items}
          onSelectItem={(id, title) => setSelectedItem({ id, title })}
        />
      )}

      {/* Item daily modal */}
      {selectedItem && (
        <ItemDailyModal
          itemId={selectedItem.id}
          itemTitle={selectedItem.title}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  )
}
