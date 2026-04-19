import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { OverviewSeries, Period } from '../../api/client'

interface Props {
  currentSeries: OverviewSeries[]
  previousSeries: OverviewSeries[]
  metric: 'views' | 'clicks'
  period: Period
}

function formatLabel(label: string, period: Period): string {
  if (period === 'day') {
    // label is an hour like "14" or ISO timestamp — show "HH:00"
    const hour = label.length <= 2 ? label.padStart(2, '0') : label.slice(11, 13)
    return `${hour}:00`
  }
  // week / month — format ISO date as "DD MMM"
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

export default function TrendChart({ currentSeries, previousSeries, metric, period }: Props) {
  const chartData = currentSeries.map((point, i) => ({
    label: point.label,
    current: point[metric],
    previous: previousSeries[i]?.[metric] ?? 0,
  }))

  return (
    <div data-testid="trend-chart">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="label"
            stroke="var(--muted)"
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            tickFormatter={(v: string) => formatLabel(v, period)}
          />
          <YAxis
            stroke="var(--muted)"
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="current"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            name="Curent"
          />
          <Line
            type="monotone"
            dataKey="previous"
            stroke="var(--muted)"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            name="Anterior"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
