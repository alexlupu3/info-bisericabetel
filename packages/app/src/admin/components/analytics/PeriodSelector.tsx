import type { Period } from '../../api/client'

interface Props {
  value: Period
  onChange: (p: Period) => void
}

const options: Array<{ label: string; period: Period }> = [
  { label: 'Zi', period: 'day' },
  { label: 'Săptămână', period: 'week' },
  { label: 'Lună', period: 'month' },
]

export default function PeriodSelector({ value, onChange }: Props) {
  return (
    <div className="flex gap-0" data-testid="period-selector">
      {options.map(({ label, period }) => (
        <button
          key={period}
          data-testid={`period-${period}`}
          onClick={() => onChange(period)}
          className={[
            'px-3 py-1.5 text-xs uppercase tracking-widest font-content transition-colors',
            value === period
              ? 'bg-[var(--accent)] text-white border border-[var(--accent)]'
              : 'border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] bg-transparent',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
