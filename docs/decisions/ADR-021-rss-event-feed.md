# ADR-021: RSS 2.0 Event Feed — Format, Link Semantics and Caching

- **Status:** Proposed
- **Date:** 2026-10-28
- **Related:** [ADR-013](ADR-013-http-cache-strategy.md) (HTTP caching), [ADR-014](ADR-014-i18n-strategy.md) (i18n fallback), [ADR-006](ADR-006-single-container-deployment.md) (single container), [ADR-015](ADR-015-remote-mcp-endpoint.md) (existing AI-agent surface), ADR-022 (SEO: `absoluteUrl`, per-item pages `/i/:itemId`)
- **Implements:** FR-060 to FR-064 (`docs/product/specs/02-rss-feed.md`); BR-025, BR-026

## Context

Upcoming events are content items with `data.startDate`, selected and expired by the query in `packages/api/src/routes/content.ts` and rendered only by the React hub. AI agents and feed readers need a stable, self-describing representation of "the upcoming events" that does not require knowledge of the JSON API or the expiry rules. The specs README fixes the feed paths (`/feed.xml`, `/:siteSlug/feed.xml`), assigns `PUBLIC_BASE_URL` / `absoluteUrl` (always absolute: production requires the variable, development defaults to `http://localhost:3100`) and the per-item page `/i/:itemId` to spec 03 (ADR-022), and the event time field to spec 04. Four decisions remained open: the syndication format, what an item links to, how event dates are carried so that agents can parse them, and how the feed is cached given that its content changes at Bucharest midnight without any database write.

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

### Item `<link>`

1. **External action link** (`data.link` / `data.siteLinks`). It is the destination admins care about, but it is optional, differs per site and leaves the hub; an item without a link would have no `<link>`.
2. **Hub page with a fragment anchor** (`absoluteUrl('/<siteSlug>#item-<id>')`). The first draft of this ADR chose it because no per-item URL existed: always present and same-origin, but it needs DOM `id`s and a hash-scroll effect in the hub, differs between the all-sites and site feeds, and a fragment is not a URL a crawler or reader can describe. **Superseded** once spec 03 introduced per-item pages.
3. **Per-item page `/i/:itemId` (chosen).** Spec 03 (ADR-022) adds a public route per item because Google `Event` rich results require one URL per event, and the README fixes it as the canonical single-item URL for every spec. `absoluteUrl('/i/<id>')` is always present, identical in every feed, carries its own title/description/`Event` JSON-LD, links to the hub, and answers 404 + `noindex` once the item expires. The external link is still exposed as `betel:actionLink` and in the description.
4. **Short link.** Short links are per-channel tracking devices (ADR-011), created ad hoc by admins; most items have none.

### Caching

1. **`no-cache` like `index.html` (ADR-013).** Correct but makes every poll a full generation.
2. **`Last-Modified` from `max(updated_at)`.** Dishonest: expiry removes items at Bucharest midnight without touching `updated_at`, and reorders bump `updated_at` without changing the feed.
3. **Strong `ETag` over the body + `Cache-Control: public, max-age=300` (chosen).** The ETag reflects the actual output (including the `lang`), so `304` is always correct; 5 minutes matches the service worker's API cache window so both channels are equally fresh.

### Item selection

1. **A new feed-specific query.** Would drift from the hub.
2. **Extract the hub's query into a service and reuse it (chosen).** `services/public-content.ts` — `listPublicContent` (unchanged behaviour) + `selectUpcomingEvents` (filter by `startDate`, chronological sort, cap). Parity by construction; spec 03's JSON-LD can reuse it.

## Decision

- Serve **RSS 2.0** at `/feed.xml` and `/:siteSlug/feed.xml` from the API process, registered before the SPA static handler, with `?lang=` for translations (enabled languages only; per-field Romanian fallback).
- Items are the hub's visible items for the same scope that have `data.startDate`, ordered by `startDate`, `startTime`, then display order, capped at 100, selected through the shared `public-content` service.
- Event dates travel in `ev:startdate` / `ev:enddate` / `ev:location` and `betel:*` elements; `ev:startdate` is a date-time with the Bucharest offset only when spec 04's `startTime` is set, otherwise a bare date.
- `<link>` is the item's canonical page `absoluteUrl('/i/<id>')` (spec 03's route), the same in every feed; `<guid>` is `urn:uuid:<id>` (`isPermaLink="false"`); `<pubDate>` is `created_at`. All absolute URLs come from `absoluteUrl()`; the feed never builds one by hand.
- Responses carry a strong `ETag`, `Cache-Control: public, max-age=300`, no `Last-Modified`; `If-None-Match` → `304`; rate limit 120/min/IP.
- Discoverability: `<link rel="alternate" type="application/rss+xml">` on hub pages (per-site via spec 03's injection), `/llms.txt` generated from the `sites` and `languages` tables, feed URLs mentioned in `robots.txt` (spec 03), feed paths denylisted in the service worker (spec 01).
- No analytics events for feed fetches.
- The serializer is a pure function with no DB or framework imports so it can be unit-tested and so that additional formats (JSON Feed) are additive.

## Implementation

- `packages/api/src/services/public-content.ts` — `listPublicContent`, `selectUpcomingEvents` (extracted from `routes/content.ts`).
- `packages/api/src/services/rss.ts` — `buildEventFeed(FeedInput): string`, `escapeXml`.
- `packages/api/src/services/feed-strings.ts` — `feed.*` UI keys, Romanian defaults, `ui_translations` lookup.
- `packages/api/src/routes/feed.ts`, `packages/api/src/routes/llms-txt.ts` — routes; registered in `packages/api/src/index.ts` after the short-link route.
- `packages/app/index.html` — static alternate link; the per-site variant goes through spec 03's `registerHeadTags` hook. No hub DOM changes.
- No schema change, no new environment variable (consumes `PUBLIC_BASE_URL` via spec 03's `public-url.ts`; item pages via spec 03's `/i/:itemId` route).

## Consequences

- Agents and readers get a stable, validated, chronological event digest per site and church-wide without learning the JSON API; `/llms.txt` makes the whole public surface self-describing.
- Hub and feed cannot disagree on visibility, because they share one query. The flip side: any future hub visibility rule (e.g. enforcing group site scope, BR-005) automatically applies to the feed, which is desired, and must be implemented in the service, not in the route.
- The feed is only as good as its link target: it depends on spec 03's `/i/:itemId` being deployed, so the two ship together or 03 first. A hub fragment anchor is no longer planned; if 03's item page ever wants its "back to hub" link to land on the item, that is a small follow-up in the hub, not in the feed.
- `pubDate = created_at` means edits do not re-surface items in readers. A `published_at` column would be the right fix if that becomes a need (new migration, new ADR amendment).
- Three XML namespaces slightly raise the bar for hand-written consumers; the validator will flag `betel:` as unknown (a recommendation, not an error).
- A 5-minute public cache delays a newly published event by up to five minutes in readers that honour it; admins see the hub immediately.
- Site-exclusive events are absent from `/feed.xml` (BR-006 parity). An agent wanting everything must fetch the per-site feeds listed in `/llms.txt`; a `?scope=all` parameter is the designated extension point if this proves inconvenient.
- First unit tests (`node --test`) in `packages/api`, if accepted (spec Q7); otherwise the feed body has only manual verification.
- Follow-ups: JSON Feed (spec Q1), iCalendar export, feed-fetch analytics (spec Q6), `published_at`.
