# ADR-021: RSS 2.0 event feed: format, link semantics and caching

- **Status:** Accepted (implemented 2026-10-29)
- **Date:** 2026-10-28
- **Related:** [ADR-013](ADR-013-http-cache-strategy.md) (HTTP caching), [ADR-014](ADR-014-i18n-strategy.md) (i18n fallback), [ADR-006](ADR-006-single-container-deployment.md) (single container), [ADR-015](ADR-015-remote-mcp-endpoint.md) (existing AI-agent surface), ADR-022 (SEO: `absoluteUrl`, per-item pages `/i/:itemId`), ADR-023 (event start time, shared `compareEventSchedules`); spec 07 `docs/product/specs/07-event-location.md` (`data.location`, `readLocation`; no ADR of its own)
- **Implements:** FR-060 to FR-064 (`docs/product/requirements.md`; the spec `02-rss-feed.md` was removed after shipping, see git history); BR-025, BR-026

## Context

**Current and upcoming events** are the content items with `data.startDate` that the public hub still shows — including multi-day events already in progress, since an item stays visible until its end date has passed in the Bucharest calendar — selected and expired by the query in `packages/api/src/routes/content.ts` and rendered only by the React hub. (Spec 03's Google `Event` markup starts from the same set but is narrower: it also needs a resolvable physical place; the feed needs none.) AI agents and feed readers need a stable, self-describing representation of that set that does not require knowledge of the JSON API or the expiry rules. The specs README fixes the feed paths (`/feed.xml`, `/:siteSlug/feed.xml`), assigns `PUBLIC_BASE_URL` / `absoluteUrl` (always absolute: production requires the variable, development defaults to `http://localhost:3100`) and the per-item page `/i/:itemId` to spec 03 (ADR-022), the event time field and the shared chronological comparator to spec 04 (ADR-023), and the free-text event location `data.location` to spec 07. Four decisions remained open: the syndication format, what an item links to, how event dates and places are carried so that agents can parse them, and how the feed is cached given that its content changes at Bucharest midnight without any database write.

Constraints: no second deployable (ADR-006); no new runtime dependency unless unavoidable; parity with the hub's visibility rules (a feed that shows a draft or an expired event is a bug); Romanian default with per-field fallback (ADR-014); cheap under polling.

## Options Considered

### Format

1. **RSS 2.0 (chosen).** Universally consumed; permits namespaced extensions; a dozen lines of serializer. Cons: dates in the core vocabulary are RFC 822 `pubDate` only, so event dates need an extension.
2. **Atom 1.0.** Cleaner spec, mandatory `updated`, but no wider reach than RSS for this audience and still no event vocabulary. No gain for the cost of a second format.
3. **JSON Feed 1.1.** Easiest for agents to parse, supports `_extensions`. Cons: smaller reader support; needs new paths the README does not reserve. Deferred (spec Q1); the serializer input is format-agnostic so adding it later is one file.
4. **iCalendar (`.ics`).** The natural format for events, but it is a calendar, not a digest: no descriptions with links in most clients, no language parameter, and not what the product owner asked for. Possible future addition on its own path.

### Event dates

1. **Only in `pubDate`.** Wrong semantics (`pubDate` is the publication time, readers sort by it) and lossy.
2. **Only in the description text.** Human-readable, not machine-parseable across languages.
3. **Namespaced elements (chosen).** `ev:` (RSS 1.0 mod_event: `startdate`, `enddate`, `location` in W3CDTF) because it is a known vocabulary, plus a project namespace `betel:` (`urn:betel:feed:1.0`) for the raw stored fields (`startDate`, `startTime`, `endDate`), the site(s), the group and the resolved action link. The project URI is a URN so it does not depend on the deployment host.

### Event place (`ev:location` and the description's "where" line)

1. **Site only.** The first draft: the single applicable site's name and address, nothing when several sites apply. Loses the explicit place an editor typed (spec 07).
2. **`data.location` only.** Loses the site for the many events that have no explicit place.
3. **`data.location`, else the single applicable site, else nothing (chosen).** One helper computes the text once per item and both `ev:location` and the "where" line use it, so they cannot disagree. `betel:site` carries the site(s) regardless. This is the README's fixed precedence ("when present it takes precedence over the site as the human-readable place name"), shared with spec 01 (push body), 03 (`Place.name`) and 06 (preview description).

### Ordering

1. **Feed-specific sort** (`startDate`, then `startTime` with untimed last). The first draft; it contradicted the shared comparator spec 04 introduces for the admin group sort and the hub (untimed first on the same date), so the same day would list in a different order in the feed and in the hub.
2. **Spec 04's `compareEventSchedules` from `@betel/shared` (chosen).** `startDate` ascending, then untimed before timed, then `startTime`; ties return `0` and a stable sort keeps the hub display order. One comparator for the hub, the admin group sort, the feed and spec 03's JSON-LD; the feed has no ordering rule of its own.

### Item `<link>`

1. **External action link** (`data.link` / `data.siteLinks`). It is the destination admins care about, but it is optional, differs per site and leaves the hub; an item without a link would have no `<link>`.
2. **Hub page with a fragment anchor** (`absoluteUrl('/<siteSlug>#item-<id>')`). The first draft of this ADR chose it because no per-item URL existed: always present and same-origin, but it needs DOM `id`s and a hash-scroll effect in the hub, differs between the all-sites and site feeds, and a fragment is not a URL a crawler or reader can describe. **Superseded** once spec 03 introduced per-item pages.
3. **Per-item page `/i/:itemId` (chosen).** Spec 03 (ADR-022) adds a public route per item because Google `Event` rich results require one URL per event, and the README fixes it as the canonical single-item URL for every spec. `absoluteUrl('/i/<id>')` is always present, identical in every feed, carries its own title/description/`Event` JSON-LD, links to the hub, and answers 404 + `noindex` once the item expires. The external link is still exposed as `betel:actionLink` and in the description.
4. **Short link.** Short links are per-channel tracking devices (ADR-011), created ad hoc by admins; most items have none.

### Caching

1. **`no-cache` like `index.html` (ADR-013).** Correct but makes every poll a full generation.
2. **`Last-Modified` from `max(updated_at)`.** Dishonest: expiry removes items at Bucharest midnight without touching `updated_at`, and reorders bump `updated_at` without changing the feed. The same objection applies to a `<lastBuildDate>` computed from `max(updated_at)`, so the feed does not do that either.
3. **A request-time `<lastBuildDate>`.** Makes the body of an unchanged (notably an empty) feed differ on every request, so a body-hash `ETag` never matches and `304` never happens. Rejected.
4. **Strong `ETag` over a deterministic body + `Cache-Control: public, max-age=300` (chosen).** The body is a pure function of the data (rows, Bucharest calendar day, package version) and the URL (`site`, `lang`): **no `<lastBuildDate>` at all** (it is optional in RSS 2.0) and no other request-time value in the document; `<ttl>5</ttl>` so the reader-side hint equals the HTTP window. Identical data therefore yields a byte-identical body and the same `ETag`, which makes `304` correct and reachable for every feed, the empty one included. 5 minutes matches the service worker's API cache window so both channels are equally fresh.

### Enclosure image

1. **Spec 06's preview derivative.** Resized files have no `media` row, so `length` and `type` (both mandatory on `<enclosure>`) would be guesses.
2. **The original upload, metadata from its `media` row matched by exact URL; no enclosure when no row matches (chosen).** `data.thumbnail` / `data.imageUrl` hold the URL the media route wrote into `media.url`, so an exact match finds `size` and `mime_type`. External URLs (ADR-015) and orphaned URLs get no enclosure rather than a fabricated length.

### Item selection

1. **A new feed-specific query.** Would drift from the hub.
2. **Extract the hub's query into a service and reuse it (chosen).** `services/public-content.ts` — `listPublicContent` (unchanged behaviour) + `selectUpcomingEvents` (filter by `startDate`, `compareEventSchedules` sort, cap) = the "current and upcoming events" of the spec's §1. Parity by construction; spec 03's JSON-LD reuses it and narrows it by place.

## Decision

- Serve **RSS 2.0** at `/feed.xml` and `/:siteSlug/feed.xml` from the API process, registered before the SPA static handler, with `?lang=` for translations (enabled languages only; per-field Romanian fallback).
- Items are the hub's visible items for the same scope that have `data.startDate` — current and upcoming events, in-progress multi-day events included, any type, no place required — ordered by spec 04's `compareEventSchedules` (`startDate`, then untimed before timed, then `startTime`; ties keep display order), capped at 100, selected through the shared `public-content` service.
- Event dates travel in `ev:startdate` / `ev:enddate` and `betel:*` elements; `ev:startdate` is a date-time with the Bucharest offset only when spec 04's `startTime` is set, otherwise a bare date.
- The place is one text per item — `readLocation(data)` (FR-094) when present, else the single applicable site (`"<name> — <address>"` / `"<name>"`), else none — emitted identically as `ev:location` and as the description's "where" line.
- `<enclosure>` references the original upload and takes `length` / `type` from the `media` row matched by exact URL; without a matching row (external or orphaned URL) no enclosure is emitted.
- `<link>` is the item's canonical page `absoluteUrl('/i/<id>')` (spec 03's route), the same in every feed; `<guid>` is `urn:uuid:<id>` (`isPermaLink="false"`); `<pubDate>` is `created_at`. All absolute URLs come from `absoluteUrl()`; the feed never builds one by hand.
- The body is deterministic: no `<lastBuildDate>`, no request-time value anywhere in the document, `<ttl>5</ttl>`; identical data gives a byte-identical body and `ETag` (tested in the serializer's unit tests and in the manual route check, empty feed included). Responses carry a strong `ETag`, `Cache-Control: public, max-age=300`, no `Last-Modified`; `If-None-Match` → `304`; rate limit 120/min/IP.
- Discoverability: `<link rel="alternate" type="application/rss+xml">` on hub pages (per-site via spec 03's injection), `/llms.txt` generated from the `sites` and `languages` tables, feed URLs mentioned in `robots.txt` (spec 03), feed paths denylisted in the service worker (spec 01).
- No analytics events for feed fetches.
- The serializer is a pure function with no DB or framework imports so it can be unit-tested and so that additional formats (JSON Feed) are additive.

## Implementation

- `packages/api/src/services/public-content.ts` — `listPublicContent`, `selectUpcomingEvents` (extracted from `routes/content.ts`).
- `packages/api/src/services/rss.ts` — `buildEventFeed(FeedInput): string` (pure; `FeedInput` holds no clock), `escapeXml`, the shared location-text helper.
- `packages/api/src/services/feed-strings.ts` — `feed.*` UI keys, Romanian defaults, `ui_translations` lookup.
- `packages/api/src/routes/feed.ts`, `packages/api/src/routes/llms-txt.ts` — routes; registered in `packages/api/src/index.ts` after the short-link route.
- `packages/app/index.html` — static alternate link; the per-site variant goes through spec 03's `registerHeadTags` hook. No hub DOM changes.
- No schema change, no new environment variable (consumes `PUBLIC_BASE_URL` via spec 03's `public-url.ts`; item pages via spec 03's `/i/:itemId` route; `compareEventSchedules` and the when-formatter via spec 04's `@betel/shared`; `readLocation` via spec 07's `packages/shared/src/event-location.ts` — until 04 / 07 merge, the feed sorts by `startDate` only and falls back to the site as the place).

## Consequences

- Agents and readers get a stable, validated, chronological event digest per site and church-wide without learning the JSON API; `/llms.txt` makes the whole public surface self-describing.
- Hub and feed cannot disagree on visibility, because they share one query. The flip side: any future hub visibility rule (e.g. enforcing group site scope, BR-005) automatically applies to the feed, which is desired, and must be implemented in the service, not in the route.
- The feed is only as good as its link target: it depends on spec 03's `/i/:itemId` being deployed, so the two ship together or 03 first. A hub fragment anchor is no longer planned; if 03's item page ever wants its "back to hub" link to land on the item, that is a small follow-up in the hub, not in the feed.
- `pubDate = created_at` means edits do not re-surface items in readers. A `published_at` column would be the right fix if that becomes a need (new migration, new ADR amendment).
- Three XML namespaces slightly raise the bar for hand-written consumers; the validator will flag `betel:` as unknown (a recommendation, not an error).
- A 5-minute public cache (`max-age=300`, `ttl=5`) delays a newly published event by up to five minutes in readers that honour it; admins see the hub immediately.
- Without `<lastBuildDate>` a reader cannot tell "when the feed was built" from the document; it has the `ETag` and `Date` header for that. In exchange an unchanged feed always answers `304`.
- The feed depends on three sibling specs for its richest output (03 for links, 04 for times and ordering, 07 for places) but degrades gracefully when any of them is not merged yet.
- Site-exclusive events are absent from `/feed.xml` (BR-006 parity). An agent wanting everything must fetch the per-site feeds listed in `/llms.txt`; a `?scope=all` parameter is the designated extension point if this proves inconvenient.
- First unit tests (`node --test`) in `packages/api`, if accepted (spec Q7); otherwise the feed body has only manual verification.
- Follow-ups: JSON Feed (spec Q1), iCalendar export, feed-fetch analytics (spec Q6), `published_at`.
