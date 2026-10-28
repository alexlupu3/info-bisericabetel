import type { Site } from '@betel/shared'
import { useLanguage } from '../context/LanguageContext'
import { useTheme } from '../hooks/useTheme'
import { UI_DEFAULTS, UI_KEYS } from '../i18n/keys'
import LanguageSwitcher from './LanguageSwitcher'
import SiteAddressList from './SiteAddressList'

export default function PublicFooter({ sites }: { sites: Site[] }) {
  const { t } = useLanguage()
  const { theme, toggle } = useTheme()
  return (
    <footer className="border-t border-[var(--border)]">
      <div className="max-w-4xl mx-auto w-full px-5 py-6">
        <SiteAddressList sites={sites} />
        <div className="flex items-center justify-between">
          <p className="text-[10px] tracking-widest uppercase text-[var(--muted)] font-content">
            {`© ${new Date().getFullYear()} ${t(UI_KEYS.FOOTER_COPYRIGHT, UI_DEFAULTS[UI_KEYS.FOOTER_COPYRIGHT])}`}
          </p>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <ThemeToggle theme={theme} onToggle={toggle} />
          </div>
        </div>
      </div>
    </footer>
  )
}

function ThemeToggle({ theme, onToggle }: { theme: 'light' | 'dark'; onToggle: () => void }) {
  const { t } = useLanguage()
  return (
    <button
      onClick={onToggle}
      aria-label={theme === 'dark' ? t(UI_KEYS.THEME_LIGHT, UI_DEFAULTS[UI_KEYS.THEME_LIGHT]) : t(UI_KEYS.THEME_DARK, UI_DEFAULTS[UI_KEYS.THEME_DARK])}
      className="text-[var(--muted)] opacity-40 hover:opacity-70 transition-opacity duration-200 focus:outline-none"
    >
      {theme === 'dark' ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}
