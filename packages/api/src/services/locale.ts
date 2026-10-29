/** The hub's default content locale: base rows are Romanian; other locales are translations (ADR-014). */
export const DEFAULT_LOCALE = 'ro'

// Intl locales for "when" texts, as the public hub maps them (LanguageContext).
const DATE_LOCALES: Record<string, string> = { ro: 'ro-RO', en: 'en-US', de: 'de-DE', hu: 'hu-HU' }

/** Intl locale for a language code (ro → ro-RO); unsupported codes fall back to ro-RO. */
export function dateLocaleFor(lang: string): string {
  const candidate = DATE_LOCALES[lang] ?? lang
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([candidate]).length > 0 ? candidate : 'ro-RO'
  } catch {
    return 'ro-RO'
  }
}
