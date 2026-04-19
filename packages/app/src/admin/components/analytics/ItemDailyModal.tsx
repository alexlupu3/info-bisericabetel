import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { api } from '../../api/client'

interface Props {
  itemId: string
  itemTitle: string
  onClose: () => void
}

interface TooltipPayloadEntry {
  name: string
  value: number
  color: string
}

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
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-xs font-content">
      <p className="text-[var(--text)] mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {entry.value.toLocaleString('ro-RO')}
        </p>
      ))}
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const day = d.getDate().toString().padStart(2, '0')
  const month = d.toLocaleDateString('ro-RO', { month: 'short' })
  return `${day} ${month}`
}

export default function ItemDailyModal({ itemId, itemTitle, onClose }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-analytics-item-daily', itemId],
    queryFn: () => api.analytics.itemDaily(itemId),
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
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Clickuri — {itemTitle}</h2>
          <button
            onClick={onClose}
            className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors font-content"
          >
            Închide
          </button>
        </div>

        {/* Content */}
        {isLoading && (
          <p className="text-[var(--muted)] font-content text-sm">Se încarcă…</p>
        )}
        {isError && (
          <p className="text-red-400 font-content text-sm">Eroare la încărcare.</p>
        )}

        {data && (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.daily}>
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
              <Line
                type="monotone"
                dataKey="clicks"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={false}
                name="Clickuri"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
