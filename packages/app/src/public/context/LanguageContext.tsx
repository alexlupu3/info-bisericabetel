import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Language } from '@betel/shared'

const LOCALE_KEY = 'betel-lang'
const DEFAULT_LOCALE = 'ro'

const DATE_LOCALE_MAP: Record<string, string> = {
  ro: 'ro-RO',
  en: 'en-US',
  de: 'de-DE',
  hu: 'hu-HU',
}

interface LanguageContextValue {
  locale: string
  setLocale: (code: string) => void
  t: (key: string, fallback: string, vars?: Record<string, string>) => string
  languages: Language[]
  dateLocale: string
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (_key, fallback) => fallback,
  languages: [],
  dateLocale: 'ro-RO',
})

async function fetchLanguages(): Promise<{ languages: Language[] }> {
  const res = await fetch('/api/languages')
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

async function fetchTranslations(locale: string): Promise<{ translations: Record<string, string> }> {
  const res = await fetch(`/api/translations?locale=${locale}`)
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState(() => {
    return localStorage.getItem(LOCALE_KEY) ?? DEFAULT_LOCALE
  })

  const { data: langData } = useQuery({
    queryKey: ['languages'],
    queryFn: fetchLanguages,
    staleTime: Infinity,
  })

  const supportedCodes = useMemo(
    () => langData?.languages.map(l => l.code) ?? [],
    [langData]
  )

  const setLocale = useCallback((code: string) => {
    const validated = supportedCodes.length === 0 || supportedCodes.includes(code)
      ? code
      : DEFAULT_LOCALE
    localStorage.setItem(LOCALE_KEY, validated)
    setLocaleState(validated)
  }, [supportedCodes])

  // Reconcile stored locale once supported languages are known
  useEffect(() => {
    if (supportedCodes.length > 0 && !supportedCodes.includes(locale)) {
      const fallback = supportedCodes[0] ?? DEFAULT_LOCALE
      localStorage.setItem(LOCALE_KEY, fallback)
      setLocaleState(fallback)
    }
  }, [supportedCodes, locale])

  const isLocaleSupported = supportedCodes.length === 0 || supportedCodes.includes(locale)

  const { data: transData } = useQuery({
    queryKey: ['ui-translations', locale],
    queryFn: () => fetchTranslations(locale),
    enabled: isLocaleSupported && locale !== DEFAULT_LOCALE,
    staleTime: 5 * 60 * 1000,
  })

  const translations = transData?.translations ?? {}

  const t = useCallback((key: string, fallback: string, vars?: Record<string, string>) => {
    let result = locale === DEFAULT_LOCALE ? fallback : (translations[key] ?? fallback)
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        result = result.replace(`{${k}}`, v)
      }
    }
    return result
  }, [locale, translations])

  const value = useMemo<LanguageContextValue>(() => ({
    locale,
    setLocale,
    t,
    languages: langData?.languages ?? [],
    dateLocale: DATE_LOCALE_MAP[locale] ?? locale,
  }), [locale, setLocale, t, langData])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
