import { useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import { api } from '../../api/client'

interface Props {
  itemId: string
  itemTitle: string
  site?: string
  onClose: () => void
}

interface TooltipPayloadEntry {
  name: string
  value: number
  color: string
  fill: string
}

// Distinct hues for short link layers (offset from the accent blue)
const SHORT_LINK_COLORS = [
  '#f59e0b', // amber
  '#10b981', // emerald
  '#f43f5e', // rose
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
]

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((sum, e) => sum + (e.value ?? 0), 0)
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-xs font-content">
      <p className="text-[var(--text)] mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {entry.value.toLocaleString('ro-RO')}
        </p>
      ))}
      {payload.length > 1 && (
        <p className="text-[var(--muted)] mt-1 border-t border-[var(--border)] pt-1">
          Total: {total.toLocaleString('ro-RO')}
        </p>
      )}
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const day = d.getDate().toString().padStart(2, '0')
  const month = d.toLocaleDateString('ro-RO', { month: 'short' })
  return `${day} ${month}`
}

export default function ItemDailyModal({ itemId, itemTitle, site, onClose }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-analytics-item-daily', itemId, site],
    queryFn: () => api.analytics.itemDaily(itemId, site),
  })

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="item-daily-modal"
    >
      <div
        className="bg-[var(--bg)] border border-[var(--border)] p-6 w-full max-w-3xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Clickuri — {itemTitle}</h2>
          <button
            onClick={onClose}
            className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors font-content"
          >
            Închide
          </button>
        </div>

        {isLoading && (
          <p className="text-[var(--muted)] font-content text-sm">Se încarcă…</p>
        )}
        {isError && (
          <p className="text-red-400 font-content text-sm">Eroare la încărcare.</p>
        )}

        {data && (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.daily} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-website" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.05} />
                  </linearGradient>
                  {data.shortLinks.map((sl, i) => (
                    <linearGradient key={sl.id} id={`grad-${sl.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={SHORT_LINK_COLORS[i % SHORT_LINK_COLORS.length]} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={SHORT_LINK_COLORS[i % SHORT_LINK_COLORS.length]} stopOpacity={0.05} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  stroke="var(--muted)"
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  tickFormatter={formatDate}
                />
                <YAxis
                  stroke="var(--muted)"
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                {data.shortLinks.length > 0 && (
                  <Legend
                    wrapperStyle={{ fontSize: 11, fontFamily: 'inherit' }}
                    formatter={(value) => (
                      <span style={{ color: 'var(--muted)', fontSize: 11 }}>{value}</span>
                    )}
                  />
                )}
                {/* Website layer — always bottom */}
                <Area
                  type="monotone"
                  dataKey="website"
                  stackId="clicks"
                  stroke="var(--accent)"
                  fill="url(#grad-website)"
                  strokeWidth={2}
                  name="Website"
                  dot={false}
                />
                {/* One layer per short link, stacked on top */}
                {data.shortLinks.map((sl, i) => (
                  <Area
                    key={sl.id}
                    type="monotone"
                    dataKey={sl.id}
                    stackId="clicks"
                    stroke={SHORT_LINK_COLORS[i % SHORT_LINK_COLORS.length]}
                    fill={`url(#grad-${sl.id})`}
                    strokeWidth={2}
                    name={sl.label}
                    dot={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>

            {data.shortLinks.length === 0 && (
              <p className="text-xs font-content text-[var(--muted)] mt-2 text-center">
                Nu există link-uri scurte pentru acest element.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
