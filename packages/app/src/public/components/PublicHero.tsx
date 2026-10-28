import type { Site } from '@betel/shared'
import { useLanguage } from '../context/LanguageContext'
import { UI_DEFAULTS, UI_KEYS } from '../i18n/keys'
import { seoNames } from '../initial-data'

// Hero of every public page: the page's only <h1> (FR-072). Mirrored by
// renderHero() in packages/api/src/services/seo/render-snapshot.ts.
export default function PublicHero({ site, accent }: { site: Site | null; accent: string }) {
  const { t } = useLanguage()
  const boldPart  = site ? 'BETEL'    : 'BISERICA'
  const lightPart = site ? site.name.toUpperCase() : 'BETEL'
  const website = seoNames().orgWebsite ?? 'https://bisericabetel.com'

  return (
    <header className="border-b border-[var(--border)]">
      <div className="max-w-4xl mx-auto w-full px-5 pt-10 pb-8 text-center">
        {/* Decorative: the brand name is the <h1> right below. */}
        <img
          src="/icons/favicon-dark.svg"
          alt=""
          width={54}
          height={64}
          className="mb-4 betel-logo"
        />
        <h1 className="text-4xl leading-none">
          <span className="betel-title-bold">{boldPart}</span><span
            className="betel-title-condensed"
            style={site ? { color: accent } : undefined}
          >
            {lightPart}
          </span>
        </h1>
        <p className="mt-3 font-content text-sm text-[var(--muted)] leading-relaxed" data-testid="hero-subtitle">
          {t(UI_KEYS.HERO_SUBTITLE, UI_DEFAULTS[UI_KEYS.HERO_SUBTITLE])}
        </p>
        <a
          href={website}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block font-content text-xs text-[var(--muted)] opacity-50 hover:opacity-80 transition-opacity duration-200"
          data-testid="hero-website-link"
        >
          {website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
        </a>
      </div>
    </header>
  )
}
