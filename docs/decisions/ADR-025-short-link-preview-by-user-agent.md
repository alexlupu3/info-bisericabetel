# ADR-025: Short-link previews served to link-preview crawlers by User-Agent; humans keep the 302

- **Status:** Accepted (implemented 2026-10-29)
- **Date:** 2026-10-28
- **Related:** ADR-011 (dynamic destination resolution), ADR-013 (HTTP cache strategy), ADR-003 (media library), ADR-022 (server-side head injection; `PUBLIC_BASE_URL` contract), ADR-021 (RSS enclosures link the original upload, not the derivative), ADR-024 (MCP shared tool contract)
- **Implements:** FR-085 – FR-089, BR-045 – BR-046 (`docs/product/requirements.md`, `docs/domain/business-rules.md`; the spec `06-short-link-previews.md` was removed after shipping, see git history)

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
Serving the uploaded WebP directly was rejected: no size cap, wrong aspect, and WebP is not accepted everywhere. Generating at upload time was rejected in favour of on-demand generation persisted under `<UPLOADS_DIR>/og/`: only images that are actually shared cost CPU, and existing uploads need no backfill. Cropping to 1.91:1 was rejected in favour of letter-boxing over a blurred copy of the image, because event posters are mostly portrait with text that cropping would cut. A best-effort size cap ("retry a few qualities, then warn") was rejected: WhatsApp silently drops previews over the limit, so the bound has to be a guarantee, which costs only a deterministic fallback sequence.

## Decision

- `GET /s/:code` serves `200 text/html` with Open Graph / Twitter Card metadata when the request is a *preview request* — the User-Agent matches the preview-crawler allowlist **or** `?preview=1` is present — the short link's `preview_mode` is `content`, and the item is *eligible*: its own title or its own image resolves (FR-086). Brand images (`brand-<accent>.jpg`) never make an item eligible; they only supply the image of a preview that is already eligible through a title. Otherwise the route behaves exactly as before (`302`, BR-012), also for unknown codes.
- Preview requests (both detection paths) never create `link_click` events and never read or write the dedup map, on every branch: the preview page, the `302` fallback (destination mode, ineligible item, unresolved destination) and the unknown-code `302 /`. The redirect carries `Cache-Control: no-store`; the HTML carries `public, max-age=300` and `Vary: User-Agent, Accept-Language`.
- `short_links.preview_mode TEXT NOT NULL DEFAULT 'content'` (`content` | `destination`) is the per-link switch back to today's behaviour; it is exposed in the admin UI and the admin/MCP APIs.
- Preview metadata is resolved through four **separate** chains defined in FR-086 — title, description, image, URL — that never borrow from one another: the title falls back to the hub share title, never to event text; the description falls back to `[when text, location].join(' · ')` (specs 04 and 07) and is otherwise omitted; `og:locale` is omitted when the language has no mapping. The image chain lives in `packages/api/src/services/preview-image.ts` and is the single implementation other features reuse.
- The preview image is always a derivative under `/uploads/og/`: a progressive JPEG, 1200×630 by default, whose size is **guaranteed** ≤ 300 000 bytes by a deterministic sequence (quality steps → smaller 1.91:1 dimensions with the real `og:image:width/height` declared → the brand derivative as final fallback), generated on first request by `sharp`, stored on the uploads volume and served immutable. Two families with different lifecycles: `<media-uuid>.jpg` belongs to its media row and is deleted with it; `brand-<accent-hex>.jpg` belongs to no row, is keyed by colour and regenerated on demand for whatever accent a site has (changing `sites.accent` yields a new file; old ones are harmless and may be deleted at any time).
- `og:url` and `<link rel="canonical">` are the absolute short URL itself (via spec 03's `absoluteUrl`), so Meta does not re-crawl another URL. They keep the `?lang=<code>` language variant when the request carried an enabled language (so each variant is cached separately) and never carry `preview=1` or any other parameter.
- Every `/s/:code` response — preview page, `302` to the destination, `302 /` for an unknown code — carries the `X-Robots-Tag: noindex` header (set before any branch), and the page additionally has `<meta name="robots" content="noindex, nofollow">` and no automatic redirect. Search crawlers are not on the allowlist and keep following the `302`.
- `PUBLIC_BASE_URL` follows spec 03's FR-066 contract without exception: in production the API refuses to start when it is missing or malformed; in development it defaults to `http://localhost:3100` with a startup warning. The short-link route has no fallback of its own and never degrades to the `302` because of configuration.

## Implementation

- `packages/api/src/routes/short-links.ts` — `X-Robots-Tag` first, then the preview branch before the click log; `?lang`, `?preview`.
- `packages/api/src/services/share-preview.ts` — pure: `PREVIEW_CRAWLER_TOKENS`, `isPreviewCrawler`, `pickLocale`, `buildPreview`, `previewDescription`, `safeDestination`, `renderPreviewHtml`; unit-tested in `share-preview.test.ts`. `resolvePreview()` (loads the rows), `updateShortLinkPreviewMode()` and `getShortLinkPreview()` live in `services/short-links.ts`.
- `packages/api/src/services/preview-image.ts` — `itemImageUrl`, `ogDerivativePath` (null for anything but `/uploads/<uuid>.webp`), `brandDerivativePath`, `accentHex`, `OG_NAME_PATTERN`.
- `packages/api/src/services/og-image.ts`, `packages/api/src/routes/og-image.ts` — `ensureOgImage` (size guard, in-flight dedup), `deleteOgDerivative` (called by `DELETE /api/admin/media/:id`), `configureOgImages`, and `GET /uploads/og/:name`.
- `packages/api/src/routes/admin/short-links.ts` — `PATCH …/short-links/:shortLinkId` (audit `short-link.update`) and `GET …/short-links/:shortLinkId/preview?locale=`; `packages/shared/src/mcp-tools.ts` — optional `previewMode` on `create_short_link` (both MCP surfaces).
- `packages/api/src/db/migrations/0014_short_link_preview_mode.sql`, `schema.ts`, `packages/shared/src/index.ts`.
- `packages/app/src/admin/components/content/ShortLinksTab.tsx`, `ShortLinkPreviewPanel.tsx` — share-card preview, mode selector, language variants.

## Consequences

- Short links shared in WhatsApp, Messenger, iMessage, Telegram, Slack, Discord, X and LinkedIn show the content's own poster and title; the destination's preview remains one click away per link.
- Human latency, redirect semantics and ADR-011's dynamic resolution are unchanged; analytics stop counting the (previously counted) crawler fetches, so short-link click totals may drop slightly after deploy — this is a correction, not a loss.
- The allowlist is a maintenance point: a new messaging platform means one token added to `share-preview.ts`. Until then that platform shows the destination preview, exactly as today.
- Platforms cache previews (Meta ~30 days, Telegram indefinitely); after editing a card's title or image, admins must use the platform's refresh tool (linked from the admin UI) or share a `?lang=` variant.
- `uploads/og/` grows by one ≤ 300 KB file per shared image plus one per accent colour in use; media derivatives are removed with their media row, brand derivatives are never removed automatically, and the whole folder can be deleted wholesale at any time (regenerated on demand).
- A rare very-noisy source image may be served smaller than 1200×630 or replaced by the brand image rather than exceed the bound; the page always declares the real dimensions, and a warning is logged so it can be looked at.
- A production deploy without `PUBLIC_BASE_URL` fails at startup (spec 03's rule), which is the intended guard: a running production API always builds absolute `og:image` / `og:url` values.

## Update History

- 2026-10-29: Implemented with spec 06. Notes on the as-built state, where it refines the text above:
  - Only Cards and Posters can be previewed. The title chain reads Card `data.title`; a Poster has no title (never `data.name`), so it is eligible through its image only; Richtext and Video items are ineligible and keep the `302`.
  - `og:site_name` is spec 03's value, `SEO_ORG_NAME` (default "Biserica Baptistă Betel"); a site-scoped link uses `<site name> · <share name>`. The title fallback is that same share name. `og:locale` reuses spec 03's `ogLocale()` (`en` → `en_US`).
  - The description's "when" text uses the RSS long format (`feedWhenText`, e.g. `sâmbătă, 14 noiembrie 2026, 18:00 · Sala mare`); an authored description is Markdown-stripped and truncated to 200 characters.
  - The size guard's final fallback is the neutral brand image (`#111111`, stored under the media name), not a per-site accent.
  - The admin preview endpoint resolves the default language to the bare short URL and other languages to `?lang=<code>`. Changing a link's mode writes the audit entry `short-link.update`.
  - Open questions settled with the spec defaults: existing links default to `content`; no per-link image or title overrides; letter-box over blur-crop; drafts and archived items are previewed like published ones (the page only holds data an admin typed for sharing); no `link_preview` analytics event; search crawlers keep the `302`.
  - Item pages `/i/:itemId` (ADR-022) also use the `/uploads/og/` derivative for `og:image` (resolved in `services/seo/page-data.ts`, emitted by `render-head.ts`). Not yet checked on the real platforms (Meta Sharing Debugger, WhatsApp, Telegram).
