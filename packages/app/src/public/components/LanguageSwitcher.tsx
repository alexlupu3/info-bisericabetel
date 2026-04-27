import { useLanguage } from '../context/LanguageContext'
import { UI_KEYS } from '../i18n/keys'

export default function LanguageSwitcher() {
  const { locale, setLocale, languages, t } = useLanguage()

  if (languages.length <= 1) return null

  if (languages.length === 2) {
    const other = languages.find(l => l.code !== locale)
    if (!other) return null
    return (
      <button
        onClick={() => setLocale(other.code)}
        data-testid="language-switcher"
        className="text-[var(--muted)] opacity-40 hover:opacity-70 transition-opacity duration-200 focus:outline-none text-[10px] tracking-widest uppercase font-content"
        aria-label={t(UI_KEYS.LANGUAGE_SWITCHER_SWITCH_TO, `Switch to ${other.name}`, { name: other.name })}
      >
        {locale.toUpperCase()}
      </button>
    )
  }

  // 3+ languages: dropdown
  return (
    <select
      value={locale}
      onChange={e => setLocale(e.target.value)}
      data-testid="language-switcher"
      className="bg-transparent text-[var(--muted)] opacity-40 hover:opacity-70 transition-opacity duration-200 focus:outline-none text-[10px] tracking-widest uppercase font-content cursor-pointer border-none"
      aria-label="Select language"
    >
      {languages.map(l => (
        <option key={l.code} value={l.code}>{l.name || l.code.toUpperCase()}</option>
      ))}
    </select>
  )
}
