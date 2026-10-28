# 06 — Short-link previews (link-preview metadata for `/s/:code`, redirect as fallback)

- **Owner area:** short-link route, short-link data model, admin short-link UI (see `README.md` → Ownership)
- **FR range:** FR-085 – FR-089
- **ADR:** [ADR-025](../../decisions/ADR-025-short-link-preview-by-user-agent.md) (Proposed)
- **Migration:** `0014_short_link_preview_mode.sql` (provisional number)
- **Status:** spec, not implemented

## 1. Summary

A short link (`https://<host>/s/abc123`) is today a bare `302` to the content item's resolved destination (`packages/api/src/routes/short-links.ts:38-66`). Every messaging app that renders link previews (WhatsApp, Messenger, iMessage, Telegram, Slack, …) fetches the URL, follows the redirect and shows the **destination's** preview — for a Google Form that is the form's generic icon and the form's internal name, not the poster and title the admin wrote for the card.

After this change, requests from link-preview crawlers get a small HTML page at `/s/:code` carrying Open Graph / Twitter Card metadata built from the content item (title and description in the right language, the item's image re-encoded as a crawler-safe 1200×630 JPEG). Humans keep getting the `302` exactly as today, and crawler fetches are no longer counted as clicks. When the item has nothing to show (no title and no image) or the admin switches a link to "destination preview", the route behaves exactly as it does now. Admins see, in the short-link tab, how the share card will look.

## 2. Goals / Non-goals

**Goals**
- A short link shared in a messaging app shows the content item's image and title instead of the destination's.
- Zero change to what a human visitor experiences (same `302`, same latency).
- Bot fetches of a short link never count as `link_click` events.
- Previews obey the picky crawlers: absolute `https` image URL, JPEG, ≤ 300 KB, 1200×630, `og:image:width/height` declared, `<head>` under 300 KB.
- Today's behaviour stays available per link ("use the destination's preview") and is the automatic fallback.
- Admins can see and switch the preview mode per short link.
- The preview-image fallback chain is implemented once, as a reusable server function, so specs 02 and 03 can reference it (README → Fixed contracts).

**Non-goals**
- SEO of `/s/:code` pages: they are `noindex`; canonical/SEO of hub pages belongs to spec 03.
- Server-rendered `<head>` for `/` and `/:siteSlug` (spec 03).
- Per-link custom title/description/image overrides (deferred — see Open questions; field names reserved).
- Auditing short-link create/update/delete (existing FR-023 gap, unchanged).
- A share-image generator for items without an image (text-on-colour cards). Only a brand fallback is specified.
- Changing the short-link code format, analytics aggregation or the dedup window.

## 3. Current state

| Concern | Where | Notes |
|---|---|---|
| Redirect route | `packages/api/src/routes/short-links.ts:38-66` (`GET /s/:code`) | Looks up `short_links.code`, resolves URL via `resolveUrl()` (`:23-36`, ADR-011 rule), logs a `link_click` deduped per `ip:code` for 10 min (`:9-17`, `:47-58`), then `reply.redirect(url ?? '/', 302)`. No `Cache-Control` on the redirect. No User-Agent handling of any kind. |
| Route order | `packages/api/src/index.ts:50-60` | `/uploads/` static first (`:50-53`), then `shortLinkRedirectRoute` (`:57`), then SPA static, then `/api/*`. The SPA `setNotFoundHandler` (`:120-126`) never sees `/s/*`. |
| Data model | `packages/api/src/db/migrations/0010_short_links.sql`, `packages/api/src/db/schema.ts:124-132` | `id, code, label, content_item_id, site_slug, created_at, created_by`. Nothing preview-related. |
| Shared type | `packages/shared/src/index.ts:55-63` (`ShortLink`), duplicated in `packages/app/src/admin/api/client.ts:128-136` | |
| Admin API | `short-links.ts:77-174` | `GET/POST /api/admin/content/:id/short-links`, `DELETE …/:shortLinkId`. No PATCH. |
| Admin UI | `packages/app/src/admin/components/content/ShortLinksTab.tsx`, mounted from `ContentPage.tsx:1567-1571` | Create (label + optional site override), copy, delete, click count. No preview. |
| Images | `packages/api/src/routes/admin/media.ts:26-65` | Every upload becomes `/uploads/<uuid>.webp`, max width 1980, quality 82. WebP is fine for Meta but there is no size cap (a 1980-px WebP poster is commonly 200–600 KB) and no JPEG, and no 1.91:1 derivative. Served by `@fastify/static` at `/uploads/` (`index.ts:50-53`). |
| Image fields | `docs/domain/content-model.md` → Image Handling, Shared Metadata | Card `data.thumbnail`, Poster `data.imageUrl`; both may be overridden per locale in `content_translations.data`. |
| Text fields | `content-model.md` → Card (`title`, `description`), Poster (`name` is admin-only and must never be shown publicly) | Translations merged as `{ ...data, ...translatedData }` (`packages/api/src/routes/content.ts:85-96`). |
| Languages | `packages/api/src/routes/languages.ts:26-31` (`GET /api/languages`), `languages` table (`is_default`, `enabled`) | Romanian is the seeded default. |
| Service worker | `packages/app/vite.config.ts:33` | `navigateFallbackDenylist: [/^\/admin/, /^\/s\//]` — `/s/*` already excluded (spec 01 owns the list). |
| Brand assets | `packages/app/public/icons/icon-512.png` (512×512), served from `PUBLIC_DIR/icons/` in production | Only square brand image available. `sites` rows have `accent` but no image. |

### How preview crawlers behave today (research, October 2026)

Behaviour is self-reported by vendors or observed; user-agents are free text and spoofable, which is acceptable here because the only thing a spoofed UA gains is an HTML page.

| Platform | User-Agent contains | Follows 3xx? | Reads | Image limits that matter | Caching / refresh |
|---|---|---|---|---|---|
| WhatsApp | `WhatsApp/2.x.x.x A\|I\|N` (fetched **from the sender's device**; sends `Accept-Language` of the sender). Meta's servers may also fetch with `facebookexternalhit/1.1` and `Facebot`. | yes | `og:title`, `og:description`, `og:url` (all required, non-empty), `og:image` (absolute) | Official: < 600 KB, width ≥ 300 px, aspect ≤ 4:1, `<head>` within first 300 KB of the HTML. Community reports: previews silently drop above ~300 KB, so this spec targets ≤ 300 KB. Tall images get the small square layout; ~1.91:1 gets the large card. | Preview is built once by the sender's app; no server cache to purge. |
| Facebook / Messenger / Instagram | `facebookexternalhit/1.1`, `Facebot` | yes (also re-fetches `og:url` and treats it as canonical) | OG | < 8 MB, ≥ 200×200; ≥ 600×315 for the large card; 1200×630 recommended; declare `og:image:width/height` so the first share renders large | ~30 days; "Scrape Again" in the Sharing Debugger |
| iMessage / Apple share sheet | frozen `Safari/9.0.1` UA **plus the tokens** `facebookexternalhit/1.1 Facebot Twitterbot/1.0` (fetched from the sender's device, consumer IPs) | yes (WebKit) | OG, Twitter Card, `<title>`, icons | WebKit decodes anything; keep it small for mobile data | Cached per device; Apple asks sites not to need UA tricks (TN2444) |
| Signal | mimics `WhatsApp/2` (fetched from the sender's device) | yes | OG | as WhatsApp | per device |
| Telegram | `TelegramBot (like TwitterBot)` | yes | OG, Twitter | no published limits; ≤ 5 MB works | aggressive; refresh via `@WebpageBot` |
| X / Twitter | `Twitterbot/1.0` | yes | `twitter:*`, falls back to OG | < 5 MB; `summary_large_image` wants ~2:1, ≥ 300×157 | ~7 days; Card Validator |
| Slack | `Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)` | yes | OG, Twitter, oEmbed | < 5 MB (approx.) | ~30 days per URL |
| Discord | `Discordbot/2.0` | yes | OG, Twitter | < 8 MB; uses `og:image:width/height` to lay out before download | per URL |
| LinkedIn | `LinkedInBot/1.0` | yes | OG | ≥ 1200×627 for the large card | ~7 days; Post Inspector |
| Google Chat | `Mozilla/5.0 (compatible; Google-PageRenderer Google (+https://developers.google.com/+/web/snippet/))` | yes | OG, schema | — | — |

Consequences for the design: (a) every crawler follows the `302`, which is exactly why the destination's preview shows today; the metadata must therefore be served with `200` **at** `/s/:code`; (b) `og:image` must be an absolute `https` URL to a file that is ≤ 300 KB, ≥ 300 px wide and ideally 1200×630; (c) iMessage and Signal are detectable only through the Meta/WhatsApp tokens they borrow; (d) WhatsApp is the only one that sends a useful `Accept-Language`; (e) `og:url` must equal the canonical short URL or Meta re-crawls the other URL; (f) Meta's checklist: no Brotli, honour `Range` correctly (Fastify ships neither compression nor broken ranges by default).

Sources: Meta WhatsApp link-preview docs (`developers.facebook.com/docs/whatsapp/link-previews`), Meta crawler preview checklist (`jwatte.com/downloads/meta-crawler-preview-checklist.md`), Apple TN2444 "Best Practices for Link Previews in Messages", Centinel Analytica crawler directory (apple-link-preview, facebookexternalhit, slackbot-linkexpanding, linkedinbot), Telegram bug tracker thread 61650, Shareaholic "Social Media Content Preview Bots".

## 4. User flows

**Public visitor (unchanged).** Taps the short link in a chat or scans the QR → browser requests `/s/abc123` → `302` to the resolved destination → `link_click` logged once per `ip:code` per 10 min. Latency identical to today.

**Sender sharing in WhatsApp (new).** Pastes `https://<host>/s/abc123` → the WhatsApp app fetches `/s/abc123` with `User-Agent: WhatsApp/2.24.x I` and `Accept-Language: ro` → API detects a preview crawler → responds `200 text/html` with OG tags: title "Seara de rugăciune", description "Joi, 5 noiembrie, 19:00", image `https://<host>/uploads/og/<uuid>.jpg` → WhatsApp fetches the JPEG (≤ 300 KB) → the message shows the poster and the title. No click is logged. Recipients who tap it go through the public-visitor flow.

**Sender sharing a link set to "destination" mode.** Same fetch → API sees `preview_mode = 'destination'` → `302` as today → WhatsApp follows it and shows the Google Form's preview. No click is logged (the crawler is still detected).

**Sender sharing a link whose item has nothing to show.** E.g. a Richtext item, or a Card without title and image → API falls back to the `302` → destination preview, as today.

**Admin.** Opens a content item → "Link-uri scurte" tab → each row shows a "Previzualizare" chip; expanding it shows a WhatsApp-style card (image, title, description, host) built from the live resolution, a mode selector ("Conținutul" / "Pagina destinație"), a language selector when more than one language is enabled, and links "Deschide pagina de previzualizare" (`/s/<code>?preview=1`) and "Verifică în Meta Sharing Debugger". Creating a link offers the same mode selector (default "Conținutul").

**Admin fixing a stale preview.** Changes the card's image → the next crawler fetch gets the new derivative URL (new media UUID ⇒ new file name) → platforms that cached the old preview need their refresh tool (Sharing Debugger "Scrape Again", Telegram `@WebpageBot`); the admin UI links to the Meta tool and the help text says so.

**AI agent (spec 05).** `create_short_link` accepts the optional `previewMode` field with the same values and default as the admin API; nothing else changes for MCP.

## 5. Requirements

- **FR-085 — Crawler detection and preview response.** `GET /s/:code` must return `200 text/html; charset=utf-8` with the metadata in FR-086 when the request is a *preview request* — its `User-Agent` matches the preview-crawler allowlist (Design → Detection) **or** the query string contains `preview=1` — and the short link's `preview_mode` is `content`, and the item is *eligible* (FR-086: an item title or an item image resolves; brand images never make an item eligible). In every other case it must behave as today (`302` to the resolved destination, `/` when unresolved or when the code is unknown — BR-012). The HTML must contain no automatic redirect (no `<meta http-equiv="refresh">`, no script) and must contain one visible `<a>` to the destination. The response must carry `Cache-Control: public, max-age=300` and `Vary: User-Agent, Accept-Language`. The `<head>` must be smaller than 8 KB.
- **FR-086 — Preview metadata resolution.** The preview is built from the short link's content item in the selected language (Design → Language). Each field has its **own** chain; no chain borrows a value from another (event text is never a title, an image is never a description):
  - title: translated `data.title` → base `data.title` → the hub's share title (`og:site_name` value owned by spec 03; today the literal `Betel Info` from `packages/app/index.html:15`). Never event text (`whenText`, location) and never Poster `data.name` (admin-only, content-model.md).
  - description: translated `data.description` → base `data.description` → `[whenText, location].filter(Boolean).join(' · ')` where `whenText` is spec 04's shared "when" formatter in the chosen locale (present only when `data.startDate` is set; date-only without `startTime`) and `location` is `readLocation(data)` (spec 07, locale-merged with Romanian fallback) → omitted (`og:description` / `twitter:description` not emitted). An authored description is used unchanged (the location is not appended to it). Trimmed to 200 characters on a word boundary with `…`.
  - image: locale-override item image → base item image → site brand image → hub brand image, where "item image" is `data.thumbnail` for Cards and `data.imageUrl` for Posters, and the brand images are the `brand-<accent>.jpg` derivatives of FR-087. Only the first two links make the item eligible (FR-085); the brand links only enrich a preview that is already eligible through a title.
  - url (`og:url`, `<link rel="canonical">`): the absolute short URL `absoluteUrl('/s/<code>')` (spec 03's helper), with `?lang=<code>` appended only when the request carried it and it is an enabled language; `preview=1` (and any other query parameter) is never echoed. Never a destination or item-page URL.
  - locale: `og:locale` is emitted only when the language maps to a known locale (Design → Metadata resolution); unmapped codes omit the tag entirely (never an empty `content`).
  - Tags emitted: `<title>`, `og:type=website`, `og:site_name`, `og:locale` (when mapped), `og:url`, `og:title`, `og:description` (when present), `og:image`, `og:image:secure_url`, `og:image:type=image/jpeg`, `og:image:width` / `og:image:height` (the stored derivative's real dimensions, 1200×630 unless the FR-087 size guard shrank it), `og:image:alt`, `twitter:card=summary_large_image`, `twitter:title`, `twitter:description` (when present), `twitter:image`, `<meta name="robots" content="noindex, nofollow">`. All values HTML-escaped.
- **FR-087 — Crawler-safe image derivative.** `GET /uploads/og/<media-uuid>.jpg` must serve a 1200×630 progressive JPEG, sRGB, metadata stripped, **always** ≤ 300 000 bytes, built from `/uploads/<media-uuid>.webp` by letter-boxing the whole image (`fit: contain`) over a blurred, darkened copy of itself, generated on first request and stored in `<UPLOADS_DIR>/og/`, with `Cache-Control: public, max-age=31536000, immutable`. The bound is guaranteed by a deterministic sequence (Design → Image derivatives): JPEG quality steps, then smaller dimensions (keeping 1.91:1 and declaring the real `og:image:width/height`), then a final fallback to the brand derivative; the sequence never ends with a file over the bound. `GET /uploads/og/brand-<accent-hex>.jpg` must serve the same-format derivative of `PUBLIC_DIR/icons/icon-512.png` centred on a solid background of that colour (`sites.accent` for a site-scoped link, neutral `#111111` otherwise). Unknown or malformed names return `404`. Lifecycle: media derivatives (`<media-uuid>.jpg`) belong to their media row and are deleted by `DELETE /api/admin/media/:id`; brand derivatives (`brand-<accent-hex>.jpg`) belong to no row — they are keyed by colour, regenerated on demand for any accent in use, and may be deleted at any time (a changed `sites.accent` simply produces a new file; stale colour files are harmless).
- **FR-088 — Fallback and analytics.** Each short link has `preview_mode ∈ {content, destination}`, default `content`. `destination` always yields the plain `302`. Preview requests (allowlisted `User-Agent` **or** `?preview=1`, FR-085) never insert a `link_click` event and never read or write the dedup map — on every branch: preview page, `302` fallback (destination mode, ineligible item, unresolved destination) and unknown code. The `302` response carries `Cache-Control: no-store`. Every `/s/:code` response — preview page, `302` to the destination, `302 /` for an unknown code — carries the header `X-Robots-Tag: noindex` (policy owned by spec 03, FR-065). Short links of archived, soft-deleted, expired or draft items resolve previews exactly like published ones (consistent with BR-011: the redirect also keeps working).
- **FR-089 — Admin visibility and control.** `GET /api/admin/content/:id/short-links` returns `previewMode`; `POST …/short-links` accepts an optional `previewMode`; `PATCH …/short-links/:shortLinkId` accepts `{ previewMode }`; `GET …/short-links/:shortLinkId/preview?locale=<code>` returns the resolved metadata as JSON (`{ mode, willPreview, locale, title, description, imageUrl, url, destination, reason }`). The Short Links tab renders a share-card preview from that JSON, a mode selector (Romanian copy in Design → Admin UI), a language selector when more than one language is enabled, and links to `/s/<code>?preview=1` and to Meta's Sharing Debugger pre-filled with the short URL.

## 6. Design

### 6.1 Detection

`packages/api/src/services/share-preview.ts` exports `isPreviewCrawler(userAgent: string | undefined): boolean` — a case-insensitive substring match against a frozen allowlist:

```
facebookexternalhit, Facebot, WhatsApp, Twitterbot, TelegramBot, Slackbot,
Discordbot, LinkedInBot, Google-PageRenderer, Pinterest, Applebot,
Viber, SkypeUriPreview, redditbot, Embedly, Iframely, vkShare, XING-contenttabreceiver
```

The first nine cover every platform in the research table (iMessage and Signal through the Meta/WhatsApp tokens). The rest are cheap to include and harmless if wrong. Googlebot/Bingbot are **not** on the list: search crawlers must keep receiving the `302` so they index the destination rather than a `noindex` stub (spec 03 is the authority on search crawlers; nothing here changes how they are treated).

**Why User-Agent detection instead of "always serve HTML with an instant redirect":**

| | UA allowlist (chosen) | HTML + `meta refresh`/JS for everyone |
|---|---|---|
| Human latency | unchanged (`302`) | +1 HTML round trip, +parse, +`meta refresh` delay on some mobile browsers; QR-code users on slow mobile data feel it (NFR-002, NFR-006) |
| JS-disabled / reader clients | unchanged | `meta refresh` only; some in-app browsers block it |
| Click counting | bots excluded by the same test; humans counted at the `302` as today | the click would have to be counted on the HTML response — which bots also fetch — so a UA test is needed anyway |
| iMessage (browser-like UA) | detected via the appended `facebookexternalhit`/`Twitterbot` tokens; Apple's own guidance (TN2444) accepts OG tags served to all clients, and the tokens exist precisely so sites can serve metadata | works |
| Meta crawler and `meta refresh` | not applicable | risk: Meta may treat the refresh as a redirect and preview the destination again (unverified) |
| Unknown crawlers | fall back to today's behaviour (destination preview) — an acceptable, known state | get the content preview |
| Spoofing | returns a harmless HTML page; nothing privileged | — |
| SEO | `/s/*` stays a redirect for search bots | every short link becomes a thin `noindex` page |

`?preview=1` forces the HTML for any client (admin "open preview page" link, curl, Sharing Debugger when testing a mode). It is a preview request exactly like an allowlisted UA: never counted as a click, never touching the dedup map, on whichever branch the route takes.

### 6.2 Route behaviour (`packages/api/src/routes/short-links.ts`)

```
GET /s/:code[?lang=xx][&preview=1]
  reply.header('X-Robots-Tag', 'noindex')                      // first line: every branch below inherits it (FR-088)
  preview = isPreviewCrawler(req.headers['user-agent']) || req.query.preview === '1'
  link = SELECT … FROM short_links WHERE code = :code
  if !link → 302 '/', Cache-Control: no-store                  (no click, no dedup — there is no link to count)
  if preview && link.previewMode === 'content':
      meta = await resolvePreview(link, pickLocale(req))       // FR-086
      if meta.willPreview:
          reply.type('text/html; charset=utf-8')
               .header('Cache-Control', 'public, max-age=300')
               .header('Vary', 'User-Agent, Accept-Language')
               .send(renderPreviewHtml(meta))
          return
  url = await resolveUrl(link.contentItemId, link.siteSlug)   (unchanged)
  if !preview: log link_click with the existing dedup         (unchanged logic; skipped for every preview request,
                                                               including this 302 fallback)
  302 url ?? '/', Cache-Control: no-store
```

`resolveUrl` stays as is (ADR-011). The route keeps its registration position (`index.ts:57`) — before the SPA static plugin. The `X-Robots-Tag` header is set before any lookup so that the unknown-code `302 /`, the `302` fallback and the preview page all carry it; the analytics skip is decided by the same `preview` boolean on every branch.

### 6.3 Metadata resolution (`services/share-preview.ts`)

```ts
export interface PreviewMeta {
  willPreview: boolean          // title or image resolved from the item (not brand)
  reason?: 'mode-destination' | 'no-title-no-image' | 'item-missing'
  locale: string
  siteName: string              // og:site_name
  title: string
  description?: string
  imageUrl: string              // absolute, /uploads/og/*.jpg
  imageWidth: number            // 1200×630 unless the size guard (§6.5) stored a smaller derivative
  imageHeight: number
  url: string                   // canonical short URL (+ ?lang when requested; never preview=1)
  destination: string           // resolved via resolveUrl(), for the <a>
}
export async function resolvePreview(link: ShortLinkRow, locale: string): Promise<PreviewMeta>
export function renderPreviewHtml(meta: PreviewMeta): string
```

One query joins `content_items` with `content_translations` for `(item, locale)` when `locale !== defaultLocale`; a second reads `sites.name, sites.accent` when `link.siteSlug` is set (used for `og:site_name` → `"<site name> · <hub name>"` and for the brand colour). Merging follows `content.ts:85-96`: `{ ...data, ...translatedData }`, so a locale image override wins automatically.

Preview image chain, exported separately for specs 02/03 (README → Fixed contracts):

```ts
// services/preview-image.ts
export function itemImageUrl(type: string, data: Record<string, unknown>): string | null
  // card → data.thumbnail, poster → data.imageUrl, else null; must start with '/uploads/'
export function ogDerivativePath(uploadUrl: string): string        // '/uploads/<uuid>.webp' → '/uploads/og/<uuid>.jpg'
export function brandDerivativePath(accentHex: string | null): string // '/uploads/og/brand-111111.jpg'
```

Description: `data.description` is Markdown-free plain text on Cards; strip newlines, collapse whitespace, cut at 200 chars on a word boundary; when present it is used unchanged. When absent, the description is `[whenText, readLocation(data)].filter(Boolean).join(' · ')` — spec 04's "when" formatter in the chosen locale (only when `data.startDate` exists; date-only when `startTime` is absent — README → Fixed contracts) followed by spec 07's location (`readLocation` from `packages/shared/src/event-location.ts`, locale-merged, Romanian fallback) — e.g. `vineri, 14 noiembrie 2026, 18:00 · Sala mare`; empty when neither exists, and then `og:description` / `twitter:description` are omitted. The title chain never reads any of these values. Stop-gaps: if spec 04 has not merged, emit the date through `Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'Europe/Bucharest' })` behind the same function name and replace it on merge; if spec 07 has not merged, `readLocation` is a local stub returning `null` and is replaced by the shared helper on merge.

`og:locale`: `{ ro: 'ro_RO', en: 'en_GB', de: 'de_DE', hu: 'hu_HU' }`; for an unmapped code the `og:locale` tag is not rendered at all — `renderPreviewHtml` emits the line only when the mapping exists (no hard-coded assumption about which languages exist, never an empty `content`).

### 6.4 Language selection

Crawlers do not expose the recipient's language; WhatsApp sends the **sender's** `Accept-Language`. Order:

1. `?lang=<code>` on the short URL, if it is an enabled language (`languages.enabled`). Lets an admin copy an English variant for an English-speaking group; echoed into `og:url` / canonical so Meta caches it separately (`preview=1` is never echoed — the canonical of a forced preview is the plain short URL).
2. `Accept-Language`, first entry whose primary subtag is an enabled language.
3. The default language (`languages.is_default`).

Fallback to default-language values happens field by field, as everywhere else (content-model.md → Locale). The admin "Copiază link" button keeps copying the bare URL; a second entry "Copiază link (EN)" appears per enabled non-default language (copy below).

### 6.5 Image derivatives (`services/og-image.ts`, `routes/og-image.ts`)

- Route `GET /uploads/og/:name`, `name` validated by `/^([0-9a-f-]{36}|brand-[0-9a-f]{6})\.jpg$/`. Registered in `index.ts` right after the `/uploads/` static plugin. Fastify's router prefers a parametric route over the static plugin's wildcard, so this route wins for `/uploads/og/*` regardless of order; still register it explicitly next to the static plugin and comment the dependency.
- If `<UPLOADS_DIR>/og/<name>` exists → `reply.sendFile(name, join(UPLOADS_DIR, 'og'))` with `Cache-Control: public, max-age=31536000, immutable` and `Content-Type: image/jpeg`. Immutability is safe because upload URLs are immutable (content-model.md → Image Handling) and the brand file is keyed by colour.
- Else generate with `sharp` (already a dependency, `packages/api/package.json:27`):
  1. source: `<UPLOADS_DIR>/<uuid>.webp` (404 if missing) or `PUBLIC_DIR/icons/icon-512.png` for `brand-*`;
  2. background: for media, the source resized `cover` to 1200×630, `blur(30)`, `modulate({ brightness: 0.6 })`; for brand, a flat `#<hex>`;
  3. foreground: source resized `contain` inside 1200×630 (`withoutEnlargement: false`, so a small thumbnail still fills the height), composited centred;
  4. encode `jpeg({ quality: 82, progressive: true, mozjpeg: true })` and apply the **size guard**, a fixed sequence that stops at the first buffer ≤ 300 000 bytes:
     1. quality 82 → 72 → 62 → 50 at 1200×630;
     2. quality 62 at 900×472, then at 600×314 (same composition, 1.91:1; `og:image:width/height` are read from the stored file, so the page declares the real size — both remain ≥ 600×315 or ≥ 300 px wide, the thresholds in §3);
     3. final fallback: the `brand-<accent>.jpg` derivative (the solid-colour background with the logo is always a few KB; itself subject to steps 1–2 for form's sake), stored under the media name so the result stays immutable and the chain is never re-run.
     Every step is deterministic (same source ⇒ same output), so the bound always holds; a warning is logged whenever step 2 or 3 is reached (not expected for photographic posters);
  5. write atomically (`tmp` + `rename`) and respond. An in-process `Map<string, Promise<Buffer>>` de-duplicates concurrent first requests for the same name.
- Two derivative families, two lifecycles: `<media-uuid>.jpg` is tied to its media row — `DELETE /api/admin/media/:id` (`media.ts:130-135`) also `unlink`s `<UPLOADS_DIR>/og/<uuid>.jpg`, ignoring ENOENT. `brand-<accent-hex>.jpg` is tied to nothing: keyed by colour, regenerated on demand for whatever accent a site currently has (`sites.accent` changes produce a new file; old colour files stay until someone clears `og/`, which is always safe).
- No eager generation at upload time: one crawler fetch per image is the only cost, derivatives persist on the uploads volume, and the admin preview triggers generation before the first share anyway.

Why letter-box over a blur instead of `cover` cropping: event posters are mostly portrait with text; cropping to 1.91:1 would cut dates and titles. The blur keeps the whole poster readable and still delivers the 1.91:1 geometry the large card layout needs.

### 6.6 HTML template

```html
<!doctype html>
<html lang="{locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{title}</title>
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{siteName}">
<meta property="og:locale" content="{ogLocale}">            <!-- line omitted when the language has no mapping -->
<meta property="og:url" content="{url}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">  <!-- line omitted when the description chain is empty -->
<meta property="og:image" content="{imageUrl}">
<meta property="og:image:secure_url" content="{imageUrl}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="{imageWidth}">    <!-- 1200×630 unless the size guard shrank the file (§6.5) -->
<meta property="og:image:height" content="{imageHeight}">
<meta property="og:image:alt" content="{title}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{description}"> <!-- line omitted when the description chain is empty -->
<meta name="twitter:image" content="{imageUrl}">
</head>
<body>
<p><a href="{destination}" rel="noopener">{title}</a></p>
</body>
</html>
```

A few hundred bytes; no CSS, no fonts, no script. Optional lines are dropped, never rendered with an empty `content`. The body is only ever seen through `?preview=1` or by a spoofed crawler.

### 6.7 Data model — migration `0014_short_link_preview_mode.sql`

```sql
ALTER TABLE short_links
  ADD COLUMN IF NOT EXISTS preview_mode TEXT NOT NULL DEFAULT 'content'
  CHECK (preview_mode IN ('content', 'destination'));
```

`schema.ts` → `previewMode: text('preview_mode').notNull().default('content')`. Shared type `ShortLink` gains `previewMode: 'content' | 'destination'` (`packages/shared/src/index.ts:55-63`; mirror in `client.ts:128-136`). Existing links switch to content previews on deploy (Open question 1).

Reserved for the deferred per-link overrides (not created now): `preview_title`, `preview_description`, `preview_image_url`.

### 6.8 API

| Method / path | Change |
|---|---|
| `GET /s/:code` | FR-085/088. Query: `lang`, `preview`. |
| `GET /uploads/og/:name` | new, FR-087, public, no auth. |
| `GET /api/admin/content/:id/short-links` | row gains `previewMode` (add `sl.preview_mode` to the SQL at `short-links.ts:91-104`). |
| `POST /api/admin/content/:id/short-links` | body gains optional `previewMode` (validated; `400` otherwise). |
| `PATCH /api/admin/content/:id/short-links/:shortLinkId` | new; body `{ previewMode }`; `200` with the row; `404` when not found under that item; admin/super-admin. |
| `GET /api/admin/content/:id/short-links/:shortLinkId/preview?locale=` | new; returns `PreviewMeta` plus `mode`; never generates HTML; triggers derivative generation only when the admin UI loads the image (it uses `imageUrl` in an `<img>`). |

MCP (spec 05): `create_short_link` input gains `previewMode?: 'content' | 'destination'`, passed through to the POST body. This is the "follow-up delta owned by 6" named in the README.

### 6.9 Admin UI (`ShortLinksTab.tsx`) — copy in Romanian

- Create form: below the site select, a radio group **"Previzualizare la partajare"** with options **"Conținutul (imagine și titlu)"** (default) and **"Pagina destinație"**, help text *"Ce se afișează în WhatsApp, Messenger, Telegram etc. când linkul este trimis."* `data-testid="short-link-preview-mode"`.
- Each row: a chevron button **"Previzualizare"** (`data-testid="short-link-preview-toggle-<id>"`) expands a panel (`data-testid="short-link-preview-<id>"`) with:
  - a share card styled like a WhatsApp link bubble: image (`<img src=imageUrl>` 1.91:1, lazy), bold title (2 lines max), description (2 lines), host in muted uppercase — Betel editorial tokens from `index.css`, follow the `frontend-design` skill;
  - when `willPreview` is false: a muted notice *"Se va folosi previzualizarea paginii destinație"* with the reason (*"linkul este setat pe «Pagina destinație»"* / *"conținutul nu are titlu și nici imagine"*);
  - the mode radio (same labels), saving through `PATCH` on change, toast *"Previzualizare actualizată"*;
  - a language `<select>` (`data-testid="short-link-preview-locale"`) shown only when `GET /api/admin/languages` returns more than one enabled language;
  - links: **"Deschide pagina de previzualizare"** → `/s/<code>?preview=1` (new tab), **"Verifică în Meta Sharing Debugger"** → `https://developers.facebook.com/tools/debug/?q=<encoded short URL>`;
  - help text: *"Aplicațiile păstrează previzualizările în cache. După ce schimbi imaginea sau titlul, folosește «Scrape Again» în Sharing Debugger sau trimite linkul cu `?lang=…` pentru a forța o nouă previzualizare."*
- Copy menu: next to the copy button, when non-default languages are enabled, **"Copiază link (EN)"** per language → `/s/<code>?lang=en`.
- Row subtitle gains ` · destinație` when `previewMode === 'destination'`.

### 6.10 Configuration

No new environment variable. Consumes `PUBLIC_BASE_URL` / `absoluteUrl()` from spec 03 under 03's FR-066 contract: in production the API refuses to start when `PUBLIC_BASE_URL` is missing or malformed; in development it defaults to `http://localhost:3100` with a startup warning. This route therefore has **no** fallback of its own — `absoluteUrl()` always returns an absolute URL by the time a request arrives, and the route never checks the variable or degrades to the `302` because of it. (If 03 has not merged, T2's stop-gap `public-url.ts` implements exactly that startup behaviour.) Uses existing `UPLOADS_DIR` (new subfolder `og/`, created with `mkdirSync(recursive)`).

### 6.11 Security and privacy

- The preview exposes a content item's title, description and image to anyone who fetches `/s/<code>` with a crawler UA or `?preview=1`. Short links are created deliberately by admins for distribution, and the same data is public on the hub once published. Draft items are the only new exposure; it is accepted (Open question 4) because the destination link is already exposed by the redirect.
- All interpolated values are HTML-escaped (`&<>"'`). `destination` is additionally restricted to `http(s):` or a path starting with `/` — anything else renders as `/`.
- `/uploads/og/:name` only ever reads files whose names match the strict pattern; no path traversal, no user-supplied paths. Generation is bounded to one in-flight job per name; CPU cost is one sharp pipeline per distinct image, once. Consider `@fastify/rate-limit` (already registered, `index.ts:48`) at 60/min per IP on this route if abuse is observed; not enabled by default.
- No cookies, no personal data in the HTML; `?lang` is the only query echoed and only when it matches an enabled language code (`^[a-z]{2,3}(-[A-Za-z]{2,4})?$`).
- Crawler UA spoofing yields nothing a `curl` could not already get from the public API.

### 6.12 Performance and caching

- Human path: one extra boolean on the UA string; no extra queries.
- Crawler path: +1 query (item + translation join) and, for site-scoped links, +1 for the site; ~ms. The HTML is cacheable for 5 min (`public, max-age=300`) with `Vary: User-Agent, Accept-Language`; CapRover's nginx does not cache by default, so this mainly tells crawlers it is fine to reuse.
- Derivatives: generated once per image, persisted on the uploads volume, served immutable. First-fetch cost ≈ 100–300 ms of sharp work on a 1980-px source.
- Redirect: `Cache-Control: no-store` so browsers always come back through the route (click counting), matching ADR-013's "entry points must stay fresh" spirit.

## 7. Contracts

**Provides**
- The crawler/preview behaviour of `/s/:code` and the `short_links.preview_mode` field (README → Ownership: short-link data model and redirect route).
- `services/preview-image.ts` — the preview-image fallback chain of a content item (`itemImageUrl`, `ogDerivativePath`, `brandDerivativePath`) and the `/uploads/og/*.jpg` derivatives, for spec 03 (`og:image` of hub pages) and spec 02 (`<enclosure>`/media thumbnails) to reuse by reference (README → Fixed contracts: "6 defines the full fallback chain").
- The MCP delta for spec 05: `create_short_link` optional `previewMode`.
- Server-rendered paths outside the SPA: `/s/*` (already in the denylist) and `/uploads/og/*` (an image path, not a navigation; no denylist entry needed — stated here so spec 01 can confirm).

**Consumes**
- Spec 03: `PUBLIC_BASE_URL` and `absoluteUrl(path)` from `packages/api/src/services/public-url.ts` (FR-066: production fails at startup without it, development defaults to `http://localhost:3100`); the hub's share name used for `og:site_name` (today `Betel Info` in `index.html`); the `noindex` policy (FR-065) that this route applies as `X-Robots-Tag`. If 03 is not merged first, task T2 creates `public-url.ts` with 03's documented signature and startup behaviour, and 03 keeps it.
- Spec 04: the shared "when" formatter for the description fallback (date-only when `startTime` is absent).
- Spec 07: `readLocation(data)` from `packages/shared/src/event-location.ts` for the description fallback (`whenText · location`); applied in FR-086 / §6.3. Local `null` stub until 07 merges.
- Spec 01: `navigateFallbackDenylist` already contains `/^\/s\//`.
- Spec 05: nothing consumed; 05 documents `create_short_link` with today's fields and references this delta.

## 8. Rollout

- No feature flag: the behaviour only engages for crawler UAs; humans are untouched. Existing links move to `preview_mode = 'content'` via the migration default (Open question 1). If the product owner prefers opt-in, change the migration default to `'destination'` and the create-form default to `'content'`.
- Deploy order: 03 (or T2's stop-gap `public-url.ts`) → this spec. `PUBLIC_BASE_URL` must be set in CapRover before deploy: the production container refuses to start without it (03 FR-066), which is the intended guard — there is no route-level degradation.
- Migration `0014` is additive; renumber if another spec merges first (README numbering note).
- Rollback: redeploy the previous image; the column is ignored by old code. Derivative files in `uploads/og/` are harmless leftovers.
- After deploy: run the manual checks in §9 against production with the Sharing Debugger before announcing to admins.

## 9. Testing

Cypress stubs the API (`AGENTS.md` → Testing reality), so only the admin UI is covered by the suite; the route and derivative logic are verified manually. The metadata chains are pure functions and **are** unit-tested (`pnpm test:unit`, `node:test`):

**Unit — `packages/api/src/services/share-preview.test.ts`** (`resolvePreview` chains on in-memory rows, `renderPreviewHtml`):
1. Title: translated → base → share title; a Card with no title, `startDate` and `location` set gets the share title, never the when/location text; Poster `data.name` is never used.
2. Description: authored `data.description` wins unchanged (location not appended); without it `startDate` + `location` → `"<when> · <location>"`; `startDate` only → `"<when>"` (date-only without `startTime`); `location` only → `"<location>"`; neither → `description` undefined and no `og:description` / `twitter:description` line in the HTML.
3. Eligibility: Card with title and no image → `willPreview: true`, `imageUrl` = brand derivative; Card without title and image → `willPreview: false, reason: 'no-title-no-image'` even though a brand image exists; Richtext → ineligible.
4. URL: `og:url` / canonical = `absoluteUrl('/s/<code>')`, plus `?lang=en` when requested with an enabled language; a request with `?preview=1&lang=en` yields `…?lang=en` (no `preview`); an unknown `?lang` yields the bare URL.
5. Locale: `ro` → `og:locale ro_RO`; an unmapped enabled code → no `og:locale` line (assert the string `og:locale` is absent).
6. Escaping: `<`, `&`, `"` in title/description are escaped; a `javascript:` destination renders as `/`.

**Cypress — extend `cypress/e2e/admin-short-links.cy.ts`** (mocks gain `previewMode`; add `GET /api/admin/content/*/short-links/*/preview` and `PATCH` intercepts):
1. Happy flow: row → "Previzualizare" → panel shows image `src` ending in `/uploads/og/<uuid>.jpg`, title "Program Duminică", description, host; mode radio reflects `content`.
2. Create with mode: select "Pagina destinație" → POST body includes `previewMode: 'destination'`.
3. Switch mode: change radio in the panel → PATCH body `{ previewMode: 'destination' }`, toast "Previzualizare actualizată", row shows "· destinație".
4. Fallback notice: preview response `willPreview: false, reason: 'no-title-no-image'` → notice text shown, no `<img>`.
5. Language selector: `/api/admin/languages` returns `ro` + `en` → select visible; choosing `en` re-requests `…/preview?locale=en`; with one language the select is absent.
6. Copy variants: with `en` enabled, "Copiază link (EN)" writes `…/s/abc123?lang=en` to the clipboard (stub `navigator.clipboard.writeText`).
7. External links: Sharing Debugger anchor `href` contains the encoded short URL; preview-page anchor is `/s/abc123?preview=1` with `target=_blank`.
8. Regression: existing specs (create, delete, site select, disabled button, cancel) still pass unchanged.

**Manual — API (run against `pnpm dev:api` on :3100 with `PUBLIC_BASE_URL=http://localhost:3100`, then against production):**
```bash
# 1. Human: unchanged 302, no-store, X-Robots-Tag: noindex
curl -sI http://localhost:3100/s/abc123 | grep -E 'HTTP|location|cache-control|x-robots-tag'
# 2. WhatsApp crawler: 200 HTML with OG tags, Vary, X-Robots-Tag, no click logged
curl -s -D - -A 'WhatsApp/2.24.20.72 I' -H 'Accept-Language: ro' http://localhost:3100/s/abc123 | grep -Ei 'og:|twitter:|canonical|robots'
# 3. iMessage-style UA (Safari + tokens): 200 HTML
curl -s -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0' http://localhost:3100/s/abc123 | head -20
# 4. English variant via Accept-Language and via ?lang
curl -s -A 'facebookexternalhit/1.1' -H 'Accept-Language: en-US,en;q=0.9' http://localhost:3100/s/abc123 | grep 'og:title'
curl -s -A 'facebookexternalhit/1.1' 'http://localhost:3100/s/abc123?lang=en' | grep -E 'og:title|og:url'
# 5. Destination mode (after PATCH) → 302 even for crawlers
curl -sI -A 'Twitterbot/1.0' http://localhost:3100/s/abc123 | grep -E 'HTTP|location'
# 6. Derivative: size, type, dimensions, immutability
curl -sD - -o /tmp/og.jpg http://localhost:3100/uploads/og/<uuid>.jpg | grep -Ei 'content-type|content-length|cache-control'; file /tmp/og.jpg   # JPEG 1200x630, < 300000 bytes
curl -sI http://localhost:3100/uploads/og/brand-3b82f6.jpg; curl -sI http://localhost:3100/uploads/og/../../etc/passwd.jpg   # 200 / 404
# 7. Analytics: after 10 crawler fetches (content mode), 10 `?preview=1` fetches with a browser UA, 10 crawler fetches
#    of a 'destination'-mode link and 10 of an ineligible (Richtext) link, SELECT COUNT(*) FROM analytics_events
#    WHERE short_link_id = … is unchanged; after one human fetch it is +1; a human fetch right after a crawler fetch
#    from the same IP is still counted (the crawler never primed the dedup map)
# 8. Unknown code: crawler UA, ?preview=1 and a browser all get 302 / with Cache-Control: no-store and X-Robots-Tag: noindex
curl -sI -A 'Twitterbot/1.0' http://localhost:3100/s/nope | grep -Ei 'HTTP|location|x-robots-tag'
# 9. Size guard: upload a 1980-px photographic WebP → derivative < 300000 bytes at 1200×630; a synthetic worst case
#    (noise image) still yields a file < 300000 bytes and og:image:width/height match the stored file
```
**Manual — platforms (production URL):** Meta Sharing Debugger (expect the large card, no warnings besides `fb:app_id`; "Scrape Again" after edits), send the link to yourself on WhatsApp (Android and iOS), iMessage, Telegram (expect the poster; if stale, send to `@WebpageBot`), Slack and Discord; then switch the link to "Pagina destinație", "Scrape Again", confirm the Google Form preview is back. Check a Poster (no title: title shows the site/hub name), a Card without image (brand image, accent background), a Richtext item (plain redirect), and an item whose image was changed after the first share (new derivative URL).

## 10. Work breakdown

| # | Task | Files | Depends on |
|---|---|---|---|
| T1 | Data model and admin API: migration `0014`, schema, shared type, `previewMode` in GET/POST, new PATCH, new `…/preview` endpoint (returns `resolvePreview` output). | `packages/api/src/db/migrations/0014_short_link_preview_mode.sql`, `packages/api/src/db/schema.ts`, `packages/shared/src/index.ts`, `packages/api/src/routes/short-links.ts` (admin section), `packages/app/src/admin/api/client.ts` (types + `shortLinks.update`, `shortLinks.preview`) | T2 for the preview endpoint body (can stub) |
| T2 | Preview services: `isPreviewCrawler`, `pickLocale`, `resolvePreview`, `renderPreviewHtml`, escaping; `preview-image.ts` chain helpers; unit tests for the chains (§9); stop-gap `public-url.ts` (with 03's startup contract) if 03 is absent, `readLocation` stub if 07 is absent. | `packages/api/src/services/share-preview.ts`, `packages/api/src/services/share-preview.test.ts`, `packages/api/src/services/preview-image.ts`, (`packages/api/src/services/public-url.ts` only if missing) | 03 (`absoluteUrl`), 04 (formatter), 07 (`readLocation`) — all with documented stop-gaps |
| T3 | Derivative generation (size guard sequence) and route; media delete cleanup. | `packages/api/src/services/og-image.ts`, `packages/api/src/routes/og-image.ts`, `packages/api/src/index.ts` (register after `/uploads/` static), `packages/api/src/routes/admin/media.ts` | none |
| T4 | Public route branch: `X-Robots-Tag` on every branch, crawler/`?preview` detection, HTML response with headers, skip click logging and dedup for every preview request on every branch, `no-store` on the redirect, `?lang`. | `packages/api/src/routes/short-links.ts` (public section) | T1 (column), T2, T3 |
| T5 | Admin UI: mode radio on create, preview panel with share card, PATCH on change, language select, copy variants, external links; Cypress cases 1–8. | `packages/app/src/admin/components/content/ShortLinksTab.tsx`, `packages/app/src/admin/api/client.ts`, `cypress/e2e/admin-short-links.cy.ts` | T1 (API shape) — UI can be built against the mocked shape in parallel |
| T6 | Docs and verification: apply §12 snippets (coordinator), ADR-025 → Accepted, run §9 manual checks on staging/production, record Sharing Debugger results in the PR. | `docs/**` per §12, `docs/decisions/ADR-025-*.md` | T1–T5 |

T2 and T3 are independent of each other and of T1; T4 integrates them. One developer can do T1→T2→T3→T4 sequentially in two to three days; T5 can run in parallel against the mocked API.

## 11. Open questions (with recommended defaults)

1. **Existing links: content preview by default?** Default **yes** (`preview_mode` defaults to `content` for existing rows). The user asked for the content preview as the main behaviour; links that genuinely want the destination's preview are switched per link.
2. **Per-link overrides (custom title / description / image)?** Default **no** for this iteration. Editors already control title, description and per-locale images on the content item; the override columns are reserved (`preview_title`, `preview_description`, `preview_image_url`) for a later spec if a real need appears.
3. **Letter-box-over-blur vs. crop (`cover`, attention) for the 1200×630 derivative?** Default **letter-box over blur** (keeps poster text). Alternative if the owner prefers edge-to-edge photos for Cards: `cover` for Cards, letter-box for Posters.
4. **Preview for draft / archived / expired items?** Default **yes** (same as the redirect, BR-011). Alternative: fall back to the `302` for non-published items — simple to add (`state !== 'published'` check) if the owner wants drafts hidden.
5. **Should bot fetches be recorded at all (new `analytics_events.event_type = 'link_preview'`)?** Default **no** — nothing in the analytics dashboard would show it, and spec 05 exposes event types generically if that changes later. Logging at `info` level is enough.
6. **Title fallback for Posters (no title field):** default **hub/site share name** (`og:site_name` value). Alternative: use the short link's `label` — rejected as default because labels are channel names ("WhatsApp Manastur"), not content titles.
7. **`og:site_name` ownership:** not in the README table. Default: **spec 03 owns the hub share name** (single constant/env) and this spec reads it; until then the literal `Betel Info` from `index.html`.
8. **Default brand image:** default **`icon-512.png` on the site accent** (data-driven, no new asset). Alternative: a dedicated 1200×630 brand JPEG checked into `packages/app/public/` and shared with spec 03's default `og:image`.
9. **Search crawlers (`Googlebot`, `Bingbot`) on `/s/:code`:** default **keep the `302`** so the destination is indexed and the stub stays out of the index; spec 03 to confirm.

## 12. Doc integration (ready-to-paste; applied by the coordinator)

**`docs/product/requirements.md`** — "Planned Features", short-link previews block (one line per FR, in sync with §5), and extend FR-044's bullet list with: `- Link previews for messaging apps: FR-085–FR-089, ADR-025.`
```
- FR-085: `GET /s/:code` returns an HTML page with Open Graph / Twitter metadata (no automatic redirect, `noindex`) when the request is a preview request (User-Agent on the link-preview crawler allowlist or `?preview=1`), the link's `preview_mode` is `content` and the item is eligible (an item title or item image resolves; brand images never make it eligible); otherwise, including unknown codes, it keeps today's `302`. **[Planned]**
- FR-086: Preview fields are resolved per language through four separate chains that never borrow from each other — title: translated → base `data.title` → hub share title (never event text, never Poster `data.name`); description: translated → base `data.description` → `[when text (spec 04), location (spec 07)].join(' · ')` → omitted; image: locale-override → base item image → site brand → hub brand (brand only enriches an eligible preview); URL: `og:url`/canonical = absolute short URL (spec 03 `absoluteUrl`) keeping `?lang` but never `preview=1`; `og:locale` omitted when unmapped. **[Planned]**
- FR-087: `GET /uploads/og/<media-uuid>.jpg` serves a crawler-safe 1200×630 progressive JPEG whose size is always ≤ 300 000 bytes through a deterministic guard (quality steps → smaller 1.91:1 dimensions → brand-image fallback), generated on first request and cached immutably; media derivatives are deleted with their media row, while `brand-<accent>.jpg` derivatives belong to no row and are regenerated per accent on demand. **[Planned]**
- FR-088: Each short link has `preview_mode` (`content` default, `destination` = today's behaviour); preview requests (allowlisted UA or `?preview=1`) never record `link_click` nor touch the dedup map on any branch, including the `302` fallback and unknown codes; the `302` carries `Cache-Control: no-store`; every `/s/:code` response carries `X-Robots-Tag: noindex`. **[Planned]**
- FR-089: The admin Short Links tab shows a share-card preview per language, a preview-mode selector and links to `/s/<code>?preview=1` and Meta's Sharing Debugger, backed by `previewMode` on the short-link endpoints and a `…/preview` JSON endpoint. **[Planned]**
```

**`docs/domain/business-rules.md`** — after BR-012:
```
- BR-045: Preview requests to `GET /s/:code` (User-Agent allowlist in `packages/api/src/services/share-preview.ts`, or `?preview=1`) receive an HTML page with Open Graph metadata built from the content item (separate title / description / image / URL chains in FR-086) when the short link's `preview_mode` is `content` and the item has its own title or image; otherwise, and for every human visitor, the link redirects as in BR-012. Preview requests never create `link_click` events on any branch; every `/s/:code` response is `X-Robots-Tag: noindex`.
- BR-046: The preview image of a content item is `data.thumbnail` (Card) or `data.imageUrl` (Poster): locale-override item image → base item image → site brand image → hub brand image, exactly as FR-086 (brand images never make an item previewable on their own); it is always served as the 1.91:1 JPEG derivative at `/uploads/og/<uuid>.jpg` (≤ 300 000 bytes, guaranteed). This chain is implemented once in `packages/api/src/services/preview-image.ts` and reused by every feature that needs a share image.
```

**`docs/domain/entities.md`** → ShortLink: add to Key attributes `preview_mode (TEXT NOT NULL DEFAULT 'content', one of content | destination — selects between the content-based link preview and the destination's own preview for crawler requests, FR-088)`; to Notes `Preview behaviour: BR-045, FR-085–FR-089, ADR-025.` → Media: add to Notes `A crawler-safe derivative `/uploads/og/<uuid>.jpg` is generated on demand and deleted with the media row; `brand-<accent>.jpg` derivatives are not tied to any row (FR-087).`

**`docs/domain/content-model.md`** → Image Handling: append
```
- Share-preview derivative: the first time a link-preview crawler (or the admin preview) needs an image, the API builds `<UPLOADS_DIR>/og/<uuid>.jpg` — progressive JPEG, 1200×630 (smaller 1.91:1 only when needed to stay ≤ 300 000 bytes), the whole image letter-boxed over a blurred copy of itself — and serves it immutable at `/uploads/og/<uuid>.jpg`. Deleting the media row deletes the derivative. See FR-087.
```
→ Shared Metadata / Locale: append `Link previews of short links pick the locale from `?lang`, then `Accept-Language`, then the default language (FR-086).`

**`docs/domain/glossary.md`** — add rows: `Link preview | The card (image, title, description) a messaging app or social network renders for a shared URL, built from the page's Open Graph tags | Served for short links by FR-085` and `Preview mode | Per-short-link setting: `content` (preview built from the content item) or `destination` (crawler is redirected and previews the destination) | Default `content``.

**`docs/architecture/overview.md`** — line 23 tree: `├─ /s/:code  short-link redirect, or OG preview page for link-preview crawlers` and `├─ /uploads/og/*.jpg  on-demand share-image derivatives`; line 50: add `Link-preview crawlers (User-Agent allowlist) get a 200 HTML page with Open Graph tags at `/s/:code` instead of the redirect ([ADR-025](../decisions/ADR-025-short-link-preview-by-user-agent.md)).`

**`docs/architecture/security.md`** — line 3: add `/uploads/og/*` to the list of paths outside `/api`. Under Authorization → admin or super-admin: `short links (including `PATCH …/short-links/:shortLinkId` and `GET …/short-links/:shortLinkId/preview`)`. Known risks table: `| Crawler UA spoofing on `/s/:code` | Reveals the content item's title/description/image (already public once published; drafts exposed only to someone holding the code) | Accepted; no privileged data; `?preview=1` makes the same page reachable by design |` and `| On-demand JPEG generation at `/uploads/og/:name` | CPU per distinct image, once | Strict name pattern, one in-flight job per name, persisted result; rate-limit if abused |`.

**`docs/architecture/deployment.md`** — Production Model bullets: `- Serves share-image derivatives at `/uploads/og/` (generated on demand into `<UPLOADS_DIR>/og/` — part of the persistent volume)` and in "Handles short-link redirects": `… and Open Graph preview pages for link-preview crawlers`. First-time setup step 2: `PUBLIC_BASE_URL` is required in production — the container does not start without it (spec 03 FR-066, documented in `configuration.md`); link previews depend on it.

**`docs/architecture/configuration.md`** — no new variable. In the `UPLOADS_DIR` row's Purpose add `; the `og/` subfolder holds generated share-image derivatives`. (`PUBLIC_BASE_URL` row is added by spec 03; add to its Purpose: `required for short-link previews (spec 06)`.)

**`docs/product/user-flows.md`** — under the admin content flow add: `- To control what a short link looks like when shared: admin opens the "Link-uri scurte" tab → "Previzualizare" on a row → sees the share card, switches between "Conținutul (imagine și titlu)" and "Pagina destinație", picks a language, and can open the preview page or Meta's Sharing Debugger.` Add a public flow: `**Sharing a short link in a messaging app:** the app fetches `/s/<code>`, receives the content's title and image, and renders the card; tapping it redirects to the destination as usual.`

**`docs/product/roadmap.md`** — Phase 2: `- ~~Short-link previews in messaging apps~~ **[planned — spec 06]**: short links show the content's image and title in WhatsApp/iMessage/Telegram instead of the destination's preview; per-link fallback to the destination preview.`

**`docs/decisions/README.md`** — index row: `| [ADR-025](ADR-025-short-link-preview-by-user-agent.md) | Short-link previews served to link-preview crawlers by User-Agent; humans keep the 302 | Proposed |`.

**Spec 05 delta** — in `05-mcp-analytics-short-links.md` → `create_short_link`: `previewMode?: 'content' | 'destination'` (default `content`), forwarded to `POST /api/admin/content/:id/short-links`; response includes `previewMode`.
