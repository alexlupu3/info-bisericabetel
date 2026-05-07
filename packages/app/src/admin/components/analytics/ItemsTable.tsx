import { useState } from 'react'
import { ChevronRight, Download } from 'lucide-react'
import { api, type ItemAnalytics } from '../../api/client'

interface Props {
  items: ItemAnalytics['items']
  site?: string
  onSelectItem: (itemId: string, title: string) => void
}

export default function ItemsTable({ items, site, onSelectItem }: Props) {
  const rows = items.filter((item) => item.itemId !== null)
  const [exporting, setExporting] = useState<string | null>(null)

  const hasShortLinkData = rows.some(r => r.shortLinkClicks > 0)

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
                <th className="text-right text-xs uppercase tracking-widest text-[var(--muted)] font-normal px-3 py-2 whitespace-nowrap">
                  Website
                </th>
                {hasShortLinkData && (
                  <th className="text-right text-xs uppercase tracking-widest text-[var(--muted)] font-normal px-3 py-2 whitespace-nowrap">
                    Link-uri scurte
                  </th>
                )}
                <th className="text-right text-xs uppercase tracking-widest text-[var(--muted)] font-normal px-3 py-2">
                  Total
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
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                    {item.websiteClicks.toLocaleString('ro-RO')}
                  </td>
                  {hasShortLinkData && (
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                      {item.shortLinkClicks > 0
                        ? item.shortLinkClicks.toLocaleString('ro-RO')
                        : '—'}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {item.clicks.toLocaleString('ro-RO')}
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--muted)]">
                    <button
                      data-testid="export-btn"
                      title="Descarcă CSV"
                      aria-label={`Descarcă CSV pentru ${item.title}`}
                      disabled={exporting === item.itemId}
                      onClick={async (e) => {
                        e.stopPropagation()
                        setExporting(item.itemId)
                        try {
                          await api.analytics.exportItemClicks(item.itemId!, item.title, site)
                        } catch (err) {
                          console.error('Export eșuat', err)
                        } finally {
                          setExporting(null)
                        }
                      }}
                      className="hover:text-[var(--foreground)] transition-colors disabled:opacity-40"
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
