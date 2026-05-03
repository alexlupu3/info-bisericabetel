import { ChevronRight, Download } from 'lucide-react'
import { api, type ItemAnalytics } from '../../api/client'

interface Props {
  items: ItemAnalytics['items']
  site?: string
  onSelectItem: (itemId: string, title: string) => void
}

export default function ItemsTable({ items, site, onSelectItem }: Props) {
  const rows = items.filter((item) => item.itemId !== null)

  return (
    <section>
      <h2 className="text-xs uppercase tracking-widest font-content text-[var(--muted)] mb-4">
        Clickuri per conținut
      </h2>

      {rows.length === 0 ? (
        <p className="text-[var(--muted)] font-content text-sm">Niciun click înregistrat.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-content border-collapse" data-testid="items-table">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left text-xs uppercase tracking-widest text-[var(--muted)] font-normal px-3 py-2">
                  Titlu
                </th>
                <th className="text-right text-xs uppercase tracking-widest text-[var(--muted)] font-normal px-3 py-2">
                  Clickuri
                </th>
                <th className="w-8" />
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr
                  key={item.itemId}
                  onClick={() => onSelectItem(item.itemId!, item.title)}
                  className="border-b border-[var(--border)] hover:bg-[var(--surface)] cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2">{item.title}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {item.clicks.toLocaleString('ro-RO')}
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--muted)]">
                    <button
                      data-testid="export-btn"
                      title="Descarcă CSV"
                      onClick={(e) => {
                        e.stopPropagation()
                        api.analytics.exportItemClicks(item.itemId!, item.title, site)
                      }}
                      className="hover:text-[var(--foreground)] transition-colors"
                    >
                      <Download size={14} />
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--muted)]">
                    <ChevronRight size={14} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
