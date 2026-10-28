// Organisation identity for SEO (spec 03 §6.1): one church, many sites. The
// organisation is configuration (SEO_* env vars); the sites are data (`sites` table).

import { SEO_DEFAULT_NAMES } from '@betel/shared'

export interface SeoConfig {
  orgName: string
  siteName: string
  siteAlternateNames: string[]
  orgWebsite: string
  orgSameAs: string[]
  /** Root-relative path (or absolute URL) of a crawlable PNG ≥ 112×112. */
  orgLogoPath: string
  defaultCountry: string
  googleSiteVerification: string | null
}

export const DEFAULT_LOGO_PATH = '/icons/icon-512.png'
/** Pixel size of DEFAULT_LOGO_PATH, emitted as og:image:width/height when it is used. */
export const DEFAULT_LOGO_SIZE = 512

function list(raw: string | undefined, fallback: string[]): string[] {
  if (raw === undefined || raw.trim() === '') return fallback
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

// `||` (not `??`) so that empty values from a copied env file fall back to defaults.
export function readSeoConfig(env: NodeJS.ProcessEnv = process.env): SeoConfig {
  const orgWebsite = (env.SEO_ORG_WEBSITE || 'https://www.bisericabetel.com').trim()
  return {
    orgName: env.SEO_ORG_NAME?.trim() || SEO_DEFAULT_NAMES.orgName,
    siteName: env.SEO_SITE_NAME?.trim() || SEO_DEFAULT_NAMES.siteName,
    siteAlternateNames: list(env.SEO_SITE_ALTERNATE_NAMES, ['Info Biserica Betel']),
    orgWebsite,
    orgSameAs: list(env.SEO_ORG_SAME_AS, []),
    orgLogoPath: env.SEO_ORG_LOGO_PATH?.trim() || DEFAULT_LOGO_PATH,
    defaultCountry: (env.SEO_DEFAULT_COUNTRY?.trim() || 'RO').toUpperCase(),
    googleSiteVerification: env.GOOGLE_SITE_VERIFICATION?.trim() || null,
  }
}

let cached: SeoConfig | null = null

export function seoConfig(): SeoConfig {
  if (!cached) cached = readSeoConfig()
  return cached
}
