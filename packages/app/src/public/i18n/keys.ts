// Public UI string keys. Romanian defaults live in `UI_DEFAULTS` (@betel/shared,
// packages/shared/src/i18n-defaults.ts) — one source for the SPA, the Translations
// admin page and the server-rendered snapshot. Append-only; each spec uses its own prefix.
export const UI_KEYS = {
  HERO_SUBTITLE: 'hero.subtitle',
  CONTENT_ERROR: 'content.error',
  CONTENT_EMPTY_WITH_SITE: 'content.empty.withSite',
  CONTENT_EMPTY_NO_SITE: 'content.empty.noSite',
  CONTENT_EMPTY_HINT: 'content.empty.hint',
  THEME_LIGHT: 'theme.light',
  THEME_DARK: 'theme.dark',
  FOOTER_COPYRIGHT: 'footer.copyright',
  SITES_ALL: 'sites.all',
  SITES_SELECT_LABEL: 'sites.selectLabel',
  LANGUAGE_SWITCHER_SWITCH_TO: 'languageSwitcher.switchTo',
  // Spec 03 (SEO)
  ITEM_BACK_TO_HUB: 'item.backToHub',
  ITEM_NOT_FOUND: 'item.notFound',
  NAV_SITES: 'nav.sites',
  SEO_FEED_LABEL: 'seo.feedLabel',
  // Spec 02 (RSS feed) — rendered server-side by the feed routes, listed here so they
  // appear on the Translations page
  FEED_TITLE: 'feed.title',
  FEED_TITLE_SITE: 'feed.title.site',
  FEED_DESCRIPTION: 'feed.description',
  FEED_DESCRIPTION_SITE: 'feed.description.site',
  FEED_WHEN: 'feed.when',
  FEED_WHERE: 'feed.where',
  FEED_DETAILS: 'feed.details',
  FEED_UNTITLED: 'feed.untitled',
} as const

export { UI_DEFAULTS } from '@betel/shared'
