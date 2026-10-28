# ADR-025: Short-Link Previews Served to Link-Preview Crawlers by User-Agent; Humans Keep the 302

- **Status:** Proposed
- **Date:** 2026-10-28
- **Related:** ADR-011 (dynamic destination resolution), ADR-013 (HTTP cache strategy), ADR-003 (media library)
- **Implements:** FR-085 – FR-089 (spec `docs/product/specs/06-short-link-previews.md`)

## Context

`GET /s/:code` is a bare `302` to the content item's resolved destination (`packages/api/src/routes/short-links.ts`). Every messaging app that renders link previews follows that redirect and shows the **destination's** metadata — for a Google Form, the form's icon and internal name — instead of the poster and title the admin wrote on the content item.

The metadata a crawler reads must therefore be served with `200` at `/s/:code` itself. Two forces pull in opposite directions: humans arriving from QR codes and chats must not pay for an extra page (NFR-002, NFR-006), and bot fetches must not be counted as clicks (FR-044 analytics). Several crawlers also impose hard limits on the preview image (WhatsApp: ≤ 600 KB officially, ≤ ~300 KB in practice, width ≥ 300 px, aspect ≤ 4:1; Meta: 1200×630 for the large card), which the 1980-px WebP uploads do not reliably meet.

## Options Considered

### Option A: Serve an HTML page with OG tags and an instant redirect to everyone
Every request to `/s/:code` gets HTML with `<meta http-equiv="refresh">` / `location.replace`; crawlers read the tags, humans are bounced.
- Pros: no User-Agent sniffing; works for any crawler, known or not; aligns with Apple's advice not to need UA tricks.
- Cons: every human pays an extra HTML round trip and a `meta refresh` delay (worst on the slow mobile connections the hub targets); JS-disabled and some in-app browsers handle `meta refresh` poorly; the click must then be counted on the HTML response, which bots also fetch — so a UA test is needed anyway to keep analytics clean; Meta's crawler may treat the refresh as a redirect and preview the destination again; every short link becomes a thin `noindex` page for search engines.

### Option B: Redirect crawlers to a separate preview page
Keep the `302` for everyone but send crawlers to `/s/:code/preview`.
- Pros: separates concerns.
- Cons: `og:url` would differ from the shared URL and Meta re-crawls `og:url` as canonical; some crawlers cap redirect chains; nothing gained over Option C.

### Option C: Detect link-preview crawlers by User-Agent and serve them the HTML; everyone else gets today's 302 (chosen)
A frozen allowlist of crawler tokens (`facebookexternalhit`, `Facebot`, `WhatsApp`, `Twitterbot`, `TelegramBot`, `Slackbot`, `Discordbot`, `LinkedInBot`, `Google-PageRenderer`, …) plus an explicit `?preview=1` escape hatch. iMessage and Signal are covered because their fetchers append the Meta/WhatsApp tokens for exactly this purpose.
- Pros: zero change for humans; the same test excludes bots from click counting; unknown crawlers degrade to today's behaviour (destination preview), which is a known and acceptable state; search crawlers keep following the redirect so the destination is indexed, not a stub.
- Cons: UA strings are spoofable (harmless: the page contains only data that is public once the item is published) and the list needs occasional maintenance; a crawler not on the list shows the destination's preview.

### Image derivative
Serving the uploaded WebP directly was rejected: no size cap, wrong aspect, and WebP is not accepted everywhere. Generating at upload time was rejected in favour of on-demand generation persisted under `<UPLOADS_DIR>/og/`: only images that are actually shared cost CPU, and existing uploads need no backfill. Cropping to 1.91:1 was rejected in favour of letter-boxing over a blurred copy of the image, because event posters are mostly portrait with text that cropping would cut.

## Decision

- `GET /s/:code` serves `200 text/html` with Open Graph / Twitter Card metadata when the request's User-Agent matches the preview-crawler allowlist (or `?preview=1`), the short link's `preview_mode` is `content`, and the item resolves a title or an image. Otherwise it behaves exactly as before (`302`, BR-012).
- Crawler requests never create `link_click` events. The redirect carries `Cache-Control: no-store`; the HTML carries `public, max-age=300` and `Vary: User-Agent, Accept-Language`.
- `short_links.preview_mode TEXT NOT NULL DEFAULT 'content'` (`content` | `destination`) is the per-link switch back to today's behaviour; it is exposed in the admin UI and the admin/MCP APIs.
- Preview metadata chains (title, description, image, locale) are defined in FR-086; the image chain lives in `packages/api/src/services/preview-image.ts` and is the single implementation other features reuse.
- The preview image is always the derivative `/uploads/og/<uuid>.jpg` — 1200×630 progressive JPEG, ≤ 300 KB, generated on first request by `sharp`, stored on the uploads volume, served immutable, deleted with its media row. Brand fallbacks are `/uploads/og/brand-<accent>.jpg` built from `icon-512.png`.
- `og:url` and `<link rel="canonical">` are the absolute short URL itself (via spec 03's `absoluteUrl`), so Meta does not re-crawl another URL. The page is `noindex, nofollow` and contains no automatic redirect.

## Implementation

- `packages/api/src/routes/short-links.ts` — branch before the click log; `?lang`, `?preview`.
- `packages/api/src/services/share-preview.ts` — `isPreviewCrawler`, `pickLocale`, `resolvePreview`, `renderPreviewHtml`.
- `packages/api/src/services/preview-image.ts` — image chain and derivative paths.
- `packages/api/src/services/og-image.ts`, `packages/api/src/routes/og-image.ts` — derivative generation and `GET /uploads/og/:name`.
- `packages/api/src/db/migrations/0013_short_link_preview_mode.sql`, `schema.ts`, `packages/shared/src/index.ts`.
- `packages/app/src/admin/components/content/ShortLinksTab.tsx` — share-card preview, mode selector, language variants.

## Consequences

- Short links shared in WhatsApp, Messenger, iMessage, Telegram, Slack, Discord, X and LinkedIn show the content's own poster and title; the destination's preview remains one click away per link.
- Human latency, redirect semantics and ADR-011's dynamic resolution are unchanged; analytics stop counting the (previously counted) crawler fetches, so short-link click totals may drop slightly after deploy — this is a correction, not a loss.
- The allowlist is a maintenance point: a new messaging platform means one token added to `share-preview.ts`. Until then that platform shows the destination preview, exactly as today.
- Platforms cache previews (Meta ~30 days, Telegram indefinitely); after editing a card's title or image, admins must use the platform's refresh tool (linked from the admin UI) or share a `?lang=` variant.
- `uploads/og/` grows by one ≤ 300 KB file per shared image; derivatives are removed with their media row and can be deleted wholesale at any time (regenerated on demand).
- Depends on `PUBLIC_BASE_URL` (spec 03) being set in production; without it the route logs a warning and keeps redirecting.
