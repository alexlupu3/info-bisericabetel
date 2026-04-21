---
status: Accepted
date: 2026-04-19
---

# ADR-009: Internationalization Strategy

## Status
Accepted

## Context
The public hub serves church members from a Romanian-speaking congregation. A request was made to support at least one additional language (English) for the public-facing UI and content. The challenge was to add this capability without complicating URLs, breaking existing behavior for Romanian users, or requiring admin staff to learn a new interface language.

Key constraints:
- Romanian is the canonical authoring language and must always be the fallback.
- Admin staff work exclusively in Romanian; the admin UI must not be localized.
- Performance is critical on Sunday mornings — any i18n mechanism must add zero overhead for Romanian users.
- URLs must remain unchanged; no `/en/` path prefixes that could break QR codes or bookmarks.

## Options Considered

### Option A: URL-based locale (e.g. `/en/`, `?lang=en`)
- Pros: shareable links carry locale; SEO-friendly.
- Cons: all existing QR codes and bookmarks would need updating; routing complexity increases; adds overhead even for Romanian users.

### Option B: localStorage-based locale with server-side translation join
- Pros: URLs never change; existing links and QR codes continue to work; locale is a client preference, not a resource property.
- Cons: locale cannot be inferred from a URL alone (minor SEO impact, acceptable for this use case).

### Option C: Fully client-side translation (bundle all translations)
- Pros: zero server round-trips after initial load.
- Cons: grows the JS bundle as languages are added; translations become harder to manage without a deploy.

## Decision
**Option B** was chosen: localStorage-based locale preference (`betel-lang`) with API-side translation merging on content endpoints.

UI string translations (small, ~10 strings) are fetched from the API on language change and cached client-side via `LanguageContext`. Content and group translations are fetched per API request with a `?locale=` parameter; when the locale is Romanian (default) the translation join is skipped entirely, preserving current query performance.

## Key Design Rules
1. **Admin UI stays Romanian.** The admin interface is never translated, regardless of the public locale setting. This avoids scope creep and keeps admin tooling simple for the existing team.
2. **Links and dates are shared across all locales.** Images are shared across locales for Richtext and Embedded YouTube Video types. For Poster and Card types, images (`imageUrl` and `thumbnail` respectively) are locale-overridable — admins can set a different image per locale via image pickers shown in translation mode. When a locale image is set it is stored in `contentTranslations.data` alongside translated text fields and merged at serve time via `{ ...original.data, ...translatedData }`. Clearing a locale image (setting it to empty string) causes the empty value to be filtered out before saving, so the base image is used as fallback. Rationale: locale-specific event posters and promotional images are a valid use case (e.g. a Romanian-language poster vs. an English-language poster for the same event). The per-locale image UX is scoped to Poster and Card only, keeping the feature narrow and avoiding complexity on types that have no image fields.
3. **Romanian fallback is always transparent.** If a translation record is missing for any field in a non-default locale, the Romanian value is returned without error or UI indicator visible to the public user.
4. **Zero overhead for the default locale.** The API does not join translation tables when `locale=ro` (or when no locale param is sent). This preserves existing query performance for the dominant user population.
5. **Language preference is localStorage only.** Key: `betel-lang`. The public API also accepts a `?locale=` query parameter directly, but no URL-encoding of locale is exposed in the public routing layer.

## Consequences
- QR codes and bookmarks are fully backward-compatible.
- Adding a new language requires only a super-admin action (no deploy).
- Translation completeness is the responsibility of super-admins; partial translations fall back silently to Romanian.
- New content types must explicitly declare which of their fields are translatable. The AI auto-translation system prompt already excludes `imageUrl` and `thumbnail` from translation so locale image selection remains an explicit admin action, not an AI-generated value.
- The `languages`, `ui_translations`, `content_translations`, and `group_translations` tables (migration `0008_i18n.sql`) are the authoritative source for all translation data.
- First-pass translations are automatically generated via OpenRouter (Claude Haiku) when content items or groups are created or updated (if `OPEN_ROUTER_API_KEY` is configured); see [ADR-010](ADR-010-ai-auto-translation-fire-and-forget.md) for the fire-and-forget job decision.
