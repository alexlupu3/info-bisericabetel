import { useState, useRef, useEffect } from 'react'
import { useSites } from '../context/SitesContext'
import { useLanguage } from '../context/LanguageContext'
import { UI_KEYS } from '../i18n/keys'

interface Props {
  activeSite: string | null
  accent: string
  onSelect: (slug: string | null) => void
}

export default function SiteSwitcher({ activeSite, accent, onSelect }: Props) {
  const sites = useSites()
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const activeLabel = activeSite
    ? (sites.find(s => s.slug === activeSite)?.name ?? t(UI_KEYS.SITES_ALL, 'Toate locațiile'))
    : t(UI_KEYS.SITES_ALL, 'Toate locațiile')

  function handleSelect(slug: string | null) {
    onSelect(slug)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative px-5 py-3">
      <button
        data-testid="site-switcher-trigger"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs tracking-widest uppercase text-[var(--muted)] hover:text-[var(--text)] transition-colors duration-150 focus:outline-none focus-visible:ring-2"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={activeSite ? { color: accent } : undefined}>{activeLabel}</span>
        <ChevronDown open={open} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t(UI_KEYS.SITES_SELECT_LABEL, 'Selectare locație')}
          className="absolute top-full left-5 mt-1 z-50 bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg py-1 min-w-[11rem]"
        >
          <SiteOption
            label={t(UI_KEYS.SITES_ALL, 'Toate locațiile')}
            active={activeSite === null}
            accent="var(--muted)"
            onClick={() => handleSelect(null)}
            testId="site-tab-all"
          />
          {sites.map(site => (
            <SiteOption
              key={site.slug}
              label={site.name}
              active={activeSite === site.slug}
              accent={site.accent}
              onClick={() => handleSelect(site.slug)}
              testId={`site-tab-${site.slug}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SiteOption({
  label,
  active,
  accent,
  onClick,
  testId,
}: {
  label: string
  active: boolean
  accent: string
  onClick: () => void
  testId: string
}) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      aria-pressed={active}
      className={[
        'w-full text-left px-4 py-2 text-xs tracking-widest uppercase',
        'transition-colors duration-150 focus:outline-none focus-visible:ring-2',
        active ? 'text-[var(--text)]' : 'text-[var(--muted)] hover:text-[var(--text)]',
      ].join(' ')}
    >
      <span className="flex items-center gap-2">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: active ? accent : 'transparent', border: `1px solid ${accent}` }}
        />
        {label}
      </span>
    </button>
  )
}
