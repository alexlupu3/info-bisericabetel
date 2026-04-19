import { TrendingUp, TrendingDown } from 'lucide-react'

interface Props {
  label: string
  value: number
  change: number
  active: boolean
  onClick: () => void
}

function toKebab(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

export default function StatCard({ label, value, change, active, onClick }: Props) {
  return (
    <div
      data-testid={`stat-card-${toKebab(label)}`}
      onClick={onClick}
      className={[
        'border border-[var(--border)] bg-[var(--surface)] px-6 py-4 min-w-[140px] cursor-pointer transition-colors hover:bg-[var(--surface-2)]',
        active ? 'border-l-2 border-l-[var(--accent)]' : '',
      ].join(' ')}
    >
      <p className="text-xs uppercase tracking-widest font-content text-[var(--muted)] mb-1">
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <p className="text-3xl font-bold tabular-nums">
          {value.toLocaleString('ro-RO')}
        </p>
        <span
          className={[
            'flex items-center gap-0.5 text-sm tabular-nums',
            change > 0 ? 'text-green-400' : change < 0 ? 'text-red-400' : 'text-[var(--muted)]',
          ].join(' ')}
        >
          {change > 0 && <TrendingUp size={14} />}
          {change < 0 && <TrendingDown size={14} />}
          {change > 0 ? `+${change}%` : change < 0 ? `${change}%` : '0%'}
        </span>
      </div>
    </div>
  )
}
