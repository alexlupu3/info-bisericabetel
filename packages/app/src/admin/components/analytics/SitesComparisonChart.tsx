import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import type { SiteComparisonData, Period } from '../../api/client'

interface Props {
  data: SiteComparisonData
  metric: 'views' | 'clicks'
  period: Period
}

function formatLabel(label: string, period: Period): string {
  if (period === 'day') {
    const hour = label.length <= 2 ? label.padStart(2, '0') : label.slice(11, 13)
    return `${hour}:00`
  }
  const d = new Date(label)
  const day = d.getDate().toString().padStart(2, '0')
  const month = d.toLocaleDateString('ro-RO', { month: 'short' })
  return `${day} ${month}`
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

export default function SitesComparisonChart({ data, metric, period }: Props) {
  const chartData = data.series.map((point) => {
    const flat: Record<string, string | number> = { label: formatLabel(point.label, period) }
    for (const site of data.sites) {
      flat[site.slug] = point.sites[site.slug]?.[metric] ?? 0
    }
    flat['total'] = point.total[metric]
    return flat
  })

  return (
    <div data-testid="sites-comparison-chart">
      <p className="text-xs text-[var(--muted)] font-content mb-3">
        Comparație pe site-uri — {metric === 'views' ? 'vizualizări' : 'clickuri'}
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="label"
            stroke="var(--muted)"
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
          />
          <YAxis
            stroke="var(--muted)"
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="total"
            stroke="#ffffff"
            strokeWidth={2}
            dot={false}
            name="Total"
          />
          {data.sites.map((site) => (
            <Line
              key={site.slug}
              type="monotone"
              dataKey={site.slug}
              stroke={site.accent}
              strokeWidth={2}
              dot={false}
              name={site.name}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
