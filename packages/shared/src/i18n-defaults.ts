// Romanian defaults of the public UI strings (key → default text).
//
// One source for the fallbacks passed to `t(key, fallback)` in the public hub
// (`packages/app/src/public/i18n/keys.ts` lists the keys), for the Translations
// admin page, and for the server-rendered HTML snapshot (ADR-022), which renders
// the default locale only. Translations for other locales live in `ui_translations`.
//
// Append-only; each spec uses its own key prefix (see docs/product/specs/README.md).

export const UI_DEFAULTS = {
  'hero.subtitle': 'Rămâi la curent cu programul și activitățile bisericii Betel',
  'content.error': 'Nu s-a putut încărca conținutul. Încearcă din nou.',
  'content.empty.withSite': 'Nicio informație disponibilă pentru {siteName} în momentul acesta.',
  'content.empty.noSite': 'Nicio informație disponibilă în momentul acesta.',
  'content.empty.hint': 'Revino mai târziu sau selectează o altă locație.',
  'theme.light': 'Comută la modul luminos',
  'theme.dark': 'Comută la modul întunecat',
  'footer.copyright': 'Biserica Baptistă Betel · Cluj-Napoca',
  'sites.all': 'Toate locațiile',
  'sites.selectLabel': 'Selectare locație',
  'languageSwitcher.switchTo': 'Switch to {name}',
  // Spec 03 (SEO): item pages, landmarks
  'item.backToHub': 'Înapoi la toate informațiile',
  'item.notFound': 'Această informație nu mai este disponibilă.',
  'nav.sites': 'Locații',
  'seo.feedLabel': 'Conținut',
  // Spec 02 (RSS feed): channel texts and description labels, rendered by the API
  'feed.title': 'Evenimente — Betel Info',
  'feed.title.site': 'Evenimente — Betel {siteName}',
  'feed.description': 'Evenimentele următoare ale bisericii Betel',
  'feed.description.site': 'Evenimentele următoare — Betel {siteName}',
  'feed.when': 'Când',
  'feed.where': 'Unde',
  'feed.details': 'Detalii',
  'feed.untitled': 'Eveniment',
  // Spec 07 (event location): screen-reader label of the card's location row
  'location.label': 'Loc de desfășurare',
} as const

export type UiKey = keyof typeof UI_DEFAULTS

/** Romanian default for a public UI key; the key itself when unknown. */
export function uiDefault(key: string): string {
  return (UI_DEFAULTS as Record<string, string>)[key] ?? key
}
