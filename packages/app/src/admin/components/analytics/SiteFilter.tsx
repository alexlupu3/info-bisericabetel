import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'

interface Props {
  value: string
  onChange: (site: string) => void
}

export default function SiteFilter({ value, onChange }: Props) {
  const { data } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.sites.list(),
  })

  if (!data?.sites.length) return null

  return (
    <select
      data-testid="site-filter"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-1.5 text-xs uppercase tracking-widest font-content border border-[var(--border)] bg-transparent text-[var(--text)] transition-colors cursor-pointer"
    >
      <option value="">Toate</option>
      {data.sites.map((s) => (
        <option key={s.slug} value={s.slug}>
          {s.name}
        </option>
      ))}
    </select>
  )
}
