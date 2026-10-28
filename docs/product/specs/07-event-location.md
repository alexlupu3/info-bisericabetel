# 07 — Event location: optional free-text venue on cards

- **Owner area:** content model (event location), admin content form (location input below the dates section), public card location row
- **FR range:** FR-090 – FR-094
- **BR block:** BR-050 – BR-053 (BR-054 left free)
- **ADR:** none — see §6.9 "Why no ADR"
- **Migration:** none (JSONB field)
- **Provides to:** 1 PWA (notification body), 2 RSS (`where` line / `ev:location`), 3 SEO (JSON-LD `Event.location` → `Place.name`), 5 MCP (card tool field delta), 6 short-link previews (description fallback)
- **Depends on:** 04 Event hours (same files: the public card date/time row and the admin dates row; the `null`-deletes-key fix in the remote MCP `update_card` merge; the `packages/shared` runtime/test scaffolding) — see "Delivery order" in `README.md`

## 1. Summary

Many cards are events, and where they happen is written into the description today ("… în Sala mare, etaj 1"), where it is unstructured, inconsistently translated and invisible to feeds, notifications and structured data. This spec adds an optional **location** (`data.location`) to **Cards only**: trimmed free text, at most 70 characters, translatable per locale with Romanian fallback like the other text fields. The public card renders it as secondary information in **its own row directly below the date/time row** (spec 04), with a **map-pin glyph** drawn in `currentColor` so it always matches the text colour. The admin form gets a single input with a character counter directly below the dates section; both MCP surfaces accept `location` on `create_card` / `update_card` (`null` clears). A small shared helper (`packages/shared/src/event-location.ts`) gives the API, the app and the consuming specs one normalisation and one length rule.

## 2. Goals / Non-goals

**Goals**

- Let an editor state where a card's event takes place, in one short line, without touching the description.
- Show that line on public cards as quiet metadata, visually paired with the date/time row and marked with a map pin, in the visitor's language when a translation exists.
- Keep the value canonical (trimmed, single-line, bounded) at every write path: admin API, translation API, both MCP surfaces and the AI translation pipeline.
- Expose the value to specs 1, 2, 3 and 6 through one helper and one precedence rule (README → Fixed contracts → Event location).

**Non-goals**

- Structured addresses, coordinates, a venue table or a link to a map. The value is plain text and is never rendered as a link (Q1 explains why; a `data.locationUrl` can be added later without migration).
- Locations on Posters, Richtext or Video items (README: Cards only; Q3).
- Any change to visibility, expiry, site scoping, sorting or notification targeting. The location is display text; the **site** remains the entity that drives everything else.
- Searching or filtering by location.
- Schema migration: `data` is JSONB.

## 3. Current state

- **Card fields.** `docs/domain/content-model.md` → Card lists title, description, thumbnail, dates, link, CTA, site link overrides; no place field. `CardData` in `packages/app/src/public/components/content/CardItem.tsx` lines 7–17 mirrors that list.
- **Where editors put the place today.** In `data.description` (Markdown, rendered by `ReactMarkdown`, `CardItem.tsx` lines 66–70 and 122–126), or in the title. Neither is machine-readable.
- **Date row.** `CardItem` renders the date line as `<p className="text-[10px] tracking-widest uppercase font-content mb-2 text-[var(--muted)]">` in both variants (lines 59–63 horizontal, 115–119 stacked). Spec 04 replaces its content with the shared "when" formatter and wraps it in `<time>`, keeping the class list (04 §6.4). That row is the anchor this spec renders under.
- **Admin form.** `packages/app/src/admin/pages/ContentPage.tsx`: `FormData` (lines 1146–1151), `itemToForm()` (1153–1174), `formToPayload()` (1176–1200, card branch writes `title`, `description`, `link`, `cta`, `thumbnail`, `siteLinks`, with `|| null` for optional text), card-specific inputs (1690–1725: thumbnail, description, link + CTA row, site link overrides), the shared dates row (1761–1776, owned by spec 04 from now on). No input has a `maxLength` or a counter today. Translation mode (`isTranslating`, 1482) renders only `TRANSLATABLE_FIELDS[form.type]` (1423–1439; card: `title`, `description`, `cta`) through a generic input/textarea loop (1625–1650) with the Romanian value as placeholder (`getOriginalValue`, 1553–1556).
- **API validation.** `POST /api/admin/content` (`packages/api/src/routes/admin/content.ts` lines 73–77) checks only the required field per type and stores `data` verbatim; `PATCH` (174–190) merges `data` key by key (`null` deletes the key) and re-checks the required field on the merged result. There is no per-field length or type validation on free-text fields. `PUT /api/admin/content/:id/translations/:locale` (392–416) stores the translation `data` object verbatim.
- **Translations.** Public `GET /api/content?locale=xx` left-joins `content_translations` and spreads the translated object over `data` (`packages/api/src/routes/content.ts` lines 84–96) — a key missing from the translation falls back to Romanian automatically (ADR-014). `scheduleContentTranslation()` (`packages/api/src/services/ai-translation.ts` lines 135–225) sends the whole `data` object (create) or the changed keys (update) to the model; the `SYSTEM_PROMPT` (lines 8–16) already says to translate "addresses written in natural language" and to leave URLs/dates alone. The admin Translations page lists UI keys from `KNOWN_KEYS` in `packages/app/src/admin/pages/TranslationsPage.tsx` lines 6–17; public components read keys from `UI_KEYS` (`packages/app/src/public/i18n/keys.ts`) through `t(key, fallback)` (`LanguageContext.tsx` lines 90–99; Romanian always uses the fallback).
- **Duplicate.** `POST /api/admin/content/:id/duplicate` (`routes/admin/content.ts` 236–247) copies every `data` key except `mediaFields` (`thumbnail`, `imageUrl`), so a new text key is copied automatically (BR-009).
- **MCP.** Remote `create_card` / `update_card` in `packages/api/src/routes/mcp.ts` (148–209, 213–293) build `data` field by field and write the DB directly; `update_card` spreads `dataFields` over `existing.data` (264–266) and today has no `null`-deletes-key path (spec 04 T2 adds it for `startTime`). Stdio `create_card` / `update_card` in `packages/mcp/src/index.ts` (199–239, 243–281) forward the same fields to the HTTP API. Spec 05 moves both schemas into `packages/shared/src/mcp-tools.ts`.
- **Shared package.** `packages/shared/src/index.ts` holds types; spec 04 adds the first runtime module (`event-time.ts`) and the test scaffolding (`tsconfig.json`, `tsx --test`), with ADR-023 decision 3 allowing pure, dependency-free runtime helpers there.
- **Vocabulary clash.** In this product "locație" already means a church **site** (`Toate locațiile`, `Selectare locație`, `Exclusiv unei locații`, the admin "Locații" page). Admin and public copy for this field must therefore not say "Locație" (see §6.3, §6.4 and the coordination note in §12).
- **Design language.** `.agents/skills/frontend-design/SKILL.md`: typography-led, monochrome, one small accent per card at most; icons as hairline strokes; `font-content` (Lato) for metadata; theme tokens `--text` / `--muted` from `packages/app/src/index.css`. `CardItem` already ships a hand-written inline SVG (`ExternalLinkIcon`, lines 19–25: 16 px, `stroke="currentColor"`, `strokeWidth 1.5`, `aria-hidden`), which is the pattern the map pin follows.

## 4. User flows

### Admin — recording where an event happens

- Trigger: an editor creates or edits a card for an event held somewhere specific.
- Steps:
  1. Fills the title, picks "Dată" (and optionally "Ora de început", spec 04).
  2. Directly below the dates row, types into "Loc de desfășurare (opțional)" — e.g. `Sala mare, etaj 1`. A counter shows `17 / 70`.
  3. Saves. The payload carries `data.location: "Sala mare, etaj 1"` (trimmed; inner whitespace runs collapsed to one space).
  4. The public card shows the date row, then a row with a map pin and `SALA MARE, ETAJ 1` in the same muted style.
- Variations:
  - Types more than 50 characters: the counter switches to the accent colour and a hint says the text will wrap to two lines on phones. Typing stops at 70 (`maxLength`); the API rejects anything longer with a 400 in case another client sends it.
  - Types only spaces, or clears the field: the payload sends `location: null` and the key is removed.
  - Translation mode (language dropdown set to `en`): "Loc de desfășurare" appears with the Romanian value as placeholder; the same 70-character limit and counter apply; leaving it empty keeps the Romanian fallback.
  - Poster / Richtext / Video: no location input (Cards only).
- Failure states: `400 { error }` from the API if the value is not a string, exceeds 70 characters after normalisation, or is sent for a non-card item; shown in the form's existing error line.

### Public visitor

- Opens the hub. A card with a location shows, under its date/time row (or alone when the card has no date — Q2), a row with a map-pin glyph and the text, both in the muted metadata colour; the glyph is decorative (`aria-hidden`) and a visually-hidden "Loc de desfășurare:" prefix (i18n key `location.label`) is read by screen readers. In English the row shows the English translation if the editor or the AI produced one, otherwise the Romanian text (server-side fallback, ADR-014); the hidden label is translated through `ui_translations`.
- On the per-item page `/i/:itemId` (spec 03) the same card component renders the same row, so the venue is visible on the page that carries the `Event` structured data.
- A visitor in a WhatsApp group tapping a short link (spec 06) sees the venue in the preview description when the card has no description of its own.

### AI agent (MCP)

- `create_card` with `location: "Sala mare"` creates the card with the field; `location: "   "` is treated as absent; a 71-character value returns a tool error naming the rule. `update_card` with `location: null` clears it; `get_item_stats` (spec 05) returns the stored value as is.

## 5. Requirements

- **FR-090 — Location field and validation.** Cards gain an optional `data.location`: a plain-text string of at most 70 UTF-16 code units (`String.prototype.length`, the same measure as HTML `maxLength`) after normalisation. Normalisation (`normalizeLocationText()` in `@betel/shared`): strip C0/C1 control characters and U+2028/U+2029, replace every whitespace run (including newlines and tabs) with one space, trim; an empty result means "absent". `POST` and `PATCH /api/admin/content` normalise the value in place and answer `400 { error }` with one of the fixed messages in §6.2 when the value is not a string, is longer than 70 after normalisation, or is present on a non-card item (validated on the resulting type and merged data for PATCH); `null` clears the key. `PUT /api/admin/content/:id/translations/:locale` applies the same normalisation and limit to `data.location`. The value is stored and rendered as text: Markdown is not interpreted and HTML is escaped by the renderer. Testable: `POST` with `location: "  Sala\n mare  "` stores `"Sala mare"`; with 71 non-space characters → 400; a poster with `location` → 400; `PATCH { data: { location: null } }` removes the key.
- **FR-091 — Admin form.** For cards, the content form shows a single-line input labelled "Loc de desfășurare (opțional)" directly below the dates row (spec 04's section), with `maxLength={70}`, a live counter "`n / 70`", and a soft hint plus accent-coloured counter above 50 characters. The input is pre-filled when editing; the payload always carries `data.location` (`"…"` normalised, or `null`), so PATCH semantics mirror `description`/`cta`. In translation mode the field is listed among the translatable card fields ("Loc de desfășurare") with the Romanian value as placeholder and the same limit and counter. Non-card types show no input. Admin copy is Romanian and never uses the word "Locație" (reserved for sites).
- **FR-092 — Public rendering.** `CardItem` renders a non-empty `data.location` as its own row immediately below the date/time row, in both card variants, through a new `EventLocation` component: an inline SVG map pin (`stroke="currentColor"`, sized `1.2em` to the text, `aria-hidden="true"`) followed by the text, using the same class list as the date row (`text-[10px] tracking-widest uppercase font-content text-[var(--muted)]`), with a visually-hidden prefix from i18n key `location.label` (Romanian fallback "Loc de desfășurare"). The row is shown whenever the location is present, with or without a date (Q2). Text wraps on narrow screens (`break-words`, no ellipsis, no fixed height); the glyph stays aligned with the first line. The location is never a link. Posters, richtext and video items do not render it. No per-language string is hard-coded.
- **FR-093 — Translation, duplication and AI pipeline.** `data.location` is a translatable text field: the public API serves the locale's value when the translation object has a non-empty `location`, otherwise the Romanian value (existing merge, ADR-014). The AI translation job translates it with the other text fields; a returned `location` that is empty or longer than 70 after normalisation is dropped from the stored translation (Romanian fallback applies) and logged, never stored invalid. The `SYSTEM_PROMPT` gains one rule telling the model that `location` is a short venue name or address: translate common nouns, keep proper names and street addresses. Duplicating a card copies `location` like every other non-media `data` key (BR-009).
- **FR-094 — Shared helper and MCP delta.** `@betel/shared` exports `packages/shared/src/event-location.ts` (§6.5: `LOCATION_MAX_LENGTH`, `LOCATION_SOFT_LENGTH`, `normalizeLocationText`, `invalidLocation`, `readLocation`), unit-tested and used by the API, the admin form, the card component and specs 1, 2, 3 and 6. Both MCP surfaces' `create_card` and `update_card` accept an optional `location` string (`update_card` also accepts `null` to clear), normalise it and return the §6.2 messages as tool errors (remote) or relay the API's 400 (stdio); once spec 05's `packages/shared/src/mcp-tools.ts` exists, the field lives there.

## 6. Design

### 6.1 Data model

`content_items.data` (JSONB), **card** only:

| Key | Type | Rule |
|-----|------|------|
| `location` | string, 1–70 UTF-16 code units, single line | **new**; optional; normalised on write; absent/`null`/`""` all mean "no explicit location" |

`content_translations.data` (JSONB), per locale: may carry `location` with the same rule. A translation without the key falls back to Romanian at read time (`routes/content.ts` lines 84–96; nothing to change).

Semantics: a human-readable place name or short address as the editor wrote it ("Sala mare", "Parcul Central, lângă fântână", "Str. Horea 12"). It is independent of the item's site scope: an item scoped to site A may say "Sala de tineret" (a room of A) or "Casa de Cultură" (not A at all). Consumers therefore use it only as the **human-readable place name** and keep using the site for visibility, targeting and postal addresses (BR-053).

Why 70 hard / 50 soft: 50 characters is one line of 10 px uppercase, wide-tracked text on a 360 px phone card; 70 covers "venue, detail, street" edge cases while still fitting two lines. Beyond that the row stops being metadata and becomes a paragraph, which is what the description is for. The limit is enforced at the API (any client), at the form (`maxLength` + counter) and documented for MCP agents; the soft threshold only advises.

Length is measured in UTF-16 code units so that the browser's `maxLength`, the counter and the API agree exactly (Romanian diacritics are one unit; an astral emoji counts two everywhere).

No migration. Existing rows have no `location`; nothing changes for them.

### 6.2 API

**Shared validation seam** — `packages/api/src/routes/admin/content.ts`:

```ts
import { invalidLocation, normalizeLocationText } from '@betel/shared'

/** Normalises data.location in place; returns a 400 message or null. */
function applyLocation(type: string, data: Record<string, unknown>): string | null {
  if (!('location' in data)) return null
  if (data.location === null || data.location === undefined) { delete data.location; return null }   // POST: store nothing
  if (type !== 'card') return 'location is only supported on cards'
  const e = invalidLocation(data.location)
  if (e) return e
  const v = normalizeLocationText(data.location as string)
  if (v) data.location = v; else delete data.location
  return null
}
```

- `POST /api/admin/content` (after `missingRequiredField`, line 76): `const locErr = applyLocation(type, data); if (locErr) return reply.code(400).send({ error: locErr })`. A `null` location on create is dropped rather than stored as JSON `null` (`formToPayload` sends `null` for empty optional text; today those nulls are stored verbatim — harmless, but `readLocation()` makes consumers robust either way).
- `PATCH /api/admin/content/:id`: `null` already deletes the key (line 178–179). After the merge and before `missingRequiredField(resultingType, finalData)` (line 189): run `invalidLocation` / `normalizeLocationText` on `mergedData.location` when the request's `data` contained `location`, with `resultingType`; a non-card resulting type with a stored or incoming `location` → 400 (validated on the **resulting** data, as 04 does for `startTime`). Normalise in `mergedData` so the stored value is canonical. `changedKeys` (line 214) then contains `location` when it changed, which triggers the partial AI translation.
- `PUT /api/admin/content/:id/translations/:locale` (line 392 ff.): if `data.location` is present: `null`/empty-after-normalisation → delete the key (fallback to Romanian); not a string or > 70 → 400 with the same messages; otherwise store normalised. Other translation keys are untouched.

Error messages (English, fixed strings so Cypress/MCP tests can assert them):

| Condition | `error` |
|-----------|---------|
| `location` is not a string (number, object, array, boolean) | `location must be a string` |
| normalised length > 70 | `location must be at most 70 characters` |
| `location` present on a non-card item (POST type, or PATCH resulting type) | `location is only supported on cards` |

Checks run in that order; `undefined` / `null` skip them (`null` means "clear").

**AI translation** (`packages/api/src/services/ai-translation.ts`):

- Add to `SYSTEM_PROMPT` (after rule 4): `7. The field "location" is a short venue name or address (max 70 characters): translate common nouns such as hall, church, park or floor, but keep proper names, street names and numbers unchanged.`
- Add `sanitizeTranslatedLocation(translated: Record<string, unknown>, entityId: string, locale: string): void` that, when `'location' in translated`: if it is a string, normalise; if the result is empty or `invalidLocation()` fails, `delete translated.location` and `console.warn(JSON.stringify({ service: 'ai-translation', event: 'location_dropped', entityType: 'content', entityId, locale, reason }))`. Call it on `translatedData` / `newFields` in the three write branches of `scheduleContentTranslation()` (lines 164–172 create-full, 197–205 update-partial, 214–222 update-full-for-new-locales) before the insert/update. The duplicate endpoint reuses the same scheduler and needs nothing.

**Public API.** `GET /api/content` returns `data` verbatim (merged per locale); no change. HTTP caching (ADR-013) unchanged.

**Duplicate.** No change; `location` is copied (BR-009 prose only).

**Remote MCP (`routes/mcp.ts`)** — field delta only (spec 5 owns the surface; after 05's T1 these lines live in `packages/shared/src/mcp-tools.ts`):

```ts
// create_card input
location: z.string().optional().describe('Where the event takes place, as free text (max 70 characters), e.g. "Sala mare, etaj 1". Shown under the date on the card and used by feeds, previews and notifications. Leave out for no explicit place.'),
// update_card input
location: z.string().nullable().optional().describe('New location text (max 70 characters), or null to clear.'),
```

Handlers: `create_card` — `if (location !== undefined) { const e = invalidLocation(location); if (e) return err(e); const v = normalizeLocationText(location); if (v) data.location = v }` before the insert. `update_card` — `location === null` deletes the key from `mergedData` (the `null`-deletes path spec 04 T2 introduces for `startTime`; if 7 lands first, add the generic `for (const k of Object.keys(dataFields)) if (dataFields[k] === null) delete mergedData[k]` loop and 04 reuses it); a string is validated and normalised the same way before the update. Audit / translation scheduling unchanged (`location` appears in `changedKeys`).

**Stdio MCP (`packages/mcp/src/index.ts`)** — same two fields; `create_card` forwards `location` inside `data`; `update_card` forwards `location: null` inside `data` so the API clears it. Validation errors come back as the API's 400 and are relayed as today. No local length check: the package does not depend on `@betel/shared` until spec 05 T1, and a local copy of the limit would drift.

### 6.3 Admin UI (`packages/app/src/admin/pages/ContentPage.tsx`)

Follow the `frontend-design` skill: the same input styling as the other text inputs, uppercase tracking-widest labels, muted hints, the counter in the admin accent only as a soft signal (no red).

- `FormData` gains `location: string`. `itemToForm`: `location: d.location ?? ''`. `formToPayload`, inside the `card` branch: `data.location = normalizeLocationText(f.location) || null` (import from `@betel/shared`).
- New block rendered **right after the shared dates row** (spec 04's `<div className="flex gap-3">…</div>`, lines 1761–1776) and **only for cards** — the dates row is shared by all types, so the location block is a sibling conditional on `form.type === 'card'`, not part of the row:
  ```tsx
  {form.type === 'card' && (
    <div>
      <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Loc de desfășurare (opțional)</label>
      <input value={form.location} onChange={e => set({ location: e.target.value })}
        maxLength={LOCATION_MAX_LENGTH} placeholder="ex: Sala mare, etaj 1"
        data-testid="create-location-input"
        className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-base font-content" />
      <LocationCounter value={form.location} testId="create-location-counter" />
    </div>
  )}
  ```
  `LocationCounter` (local to `ContentPage.tsx`, or `packages/app/src/admin/components/content/LocationCounter.tsx` if the file is getting long) renders `<p className="mt-1 text-xs font-content">` with `{value.length} / 70` in `text-[var(--muted)]`, switching to `text-[var(--accent)]` above `LOCATION_SOFT_LENGTH`, followed by the hint `Peste 50 de caractere, textul se întinde pe două rânduri pe telefon.` (`data-testid="create-location-soft-hint"`) only above 50. The counter uses `value.length` (code units) so it matches `maxLength` exactly.
- Translation mode: add `{ key: 'location', label: 'Loc de desfășurare', maxLength: LOCATION_MAX_LENGTH }` to `TRANSLATABLE_FIELDS.card` (line 1424–1428, after `cta`). Extend the field descriptor type with `maxLength?: number` and the generic single-line input (lines 1640–1646) with `maxLength={field.maxLength}` plus `<LocationCounter>` when `field.maxLength` is set (test id `trans-location-counter`). The existing "filter out empty values" step (line 1515) already drops an empty translated location so the Romanian fallback applies. Placeholder = Romanian value via `getOriginalValue('location')` (already generic).
- Placeholder copy avoids site names ("Sites are data", `AGENTS.md`).
- The content list row does not show the location (out of scope, Q5).

### 6.4 Public UI

**New component `packages/app/src/public/components/content/EventLocation.tsx`** (own file, per the README ownership table):

```tsx
import { useLanguage } from '../../context/LanguageContext'
import { UI_KEYS } from '../../i18n/keys'

function MapPinIcon() {
  // Map pin outline (lucide "map-pin" geometry, ISC); hairline stroke like ExternalLinkIcon.
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
      className="h-[1.2em] w-[1.2em] shrink-0" aria-hidden="true" focusable="false">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.75"/>
    </svg>
  )
}

export default function EventLocation({ location, className = '' }: { location: string | null | undefined; className?: string }) {
  const { t } = useLanguage()
  if (!location) return null
  return (
    <p className={`flex items-start gap-1.5 text-[10px] tracking-widest uppercase font-content text-[var(--muted)] ${className}`}
       data-testid="event-location">
      <MapPinIcon />
      <span className="sr-only">{t(UI_KEYS.LOCATION_LABEL, 'Loc de desfășurare')}: </span>
      <span className="min-w-0 break-words">{location}</span>
    </p>
  )
}
```

Design notes: the glyph inherits `color` (`currentColor`) so it is `--muted` in both themes and on every site accent — the skill's "one accent element per card" is not spent here; size `1.2em` keeps it optically equal to the 10 px capitals; `strokeWidth 1.75` on a 24-unit box renders ≈ 0.9 px at 12 px, the same hairline weight as `ExternalLinkIcon` (1.5 on 16 units); `items-start` keeps the pin on the first line when the text wraps; `break-words` prevents a 70-character token without spaces from overflowing the card; no `line-clamp`/ellipsis — at ≤ 70 characters the text is at most two lines on a phone and hiding part of a venue name is worse than a second line. `sr-only` is Tailwind's visually-hidden utility.

**`CardItem.tsx`** (both variants, after spec 04's date row):

- `CardData` gains `location?: string`.
- `const location = readLocation(d)` (from `@betel/shared`).
- Render directly after the `{whenStr && (<p …>)}` block, in both variants:
  ```tsx
  <EventLocation location={location} className={whenStr ? '-mt-1 mb-2' : 'mb-2'} />
  ```
  `-mt-1` pulls the row up to a 4 px gap under the date row (which keeps its `mb-2`), so the two metadata rows read as one block above the title; without a date the row simply takes the date row's place and spacing. The developer tunes the exact gap visually in both themes; nothing in spec 04's row changes.

**i18n** — append to `UI_KEYS` in `packages/app/src/public/i18n/keys.ts`: `LOCATION_LABEL: 'location.label'`; append to `KNOWN_KEYS` in `TranslationsPage.tsx`: `'location.label': 'Loc de desfășurare'` so super-admins see it and "generate" produces it. One key; the prefix `location.` is reserved for this spec by the README.

**Per-item page (spec 03).** `ItemPage` renders the item through `ContentRenderer` → `CardItem`, so the row appears there with no extra work; the server-side snapshot must also print it (delta in §7).

### 6.5 Shared helper — `packages/shared/src/event-location.ts` (re-exported from `packages/shared/src/index.ts`)

Pure, dependency-free, usable in the browser and in Node. Exact public surface:

```ts
/** Hard limit enforced by API, admin form and MCP tools (UTF-16 code units, = HTML maxLength). */
export const LOCATION_MAX_LENGTH = 70
/** Above this the admin form shows a soft "will wrap on phones" hint. Not enforced. */
export const LOCATION_SOFT_LENGTH = 50

/**
 * Canonical form of a location string: C0/C1 controls and U+2028/U+2029 removed, every
 * whitespace run (incl. newlines/tabs/NBSP) collapsed to one space, trimmed.
 * Does not truncate. "" means "no location".
 */
export function normalizeLocationText(raw: string): string

/**
 * Validation for data.location (any JSON value). null when valid or absent
 * (undefined/null); otherwise one of the fixed messages in §6.2
 * ('location must be a string', 'location must be at most 70 characters').
 * Length is measured after normalizeLocationText().
 */
export function invalidLocation(value: unknown): string | null

/**
 * Consumer-side accessor: the normalised, non-empty location of an item's (already
 * locale-merged) data, or null. Tolerates legacy/unnormalised values and non-strings.
 * Used by CardItem, feeds (2), JSON-LD (3), notifications (1) and previews (6).
 */
export function readLocation(data: Record<string, unknown> | null | undefined): string | null
```

Implementation notes: control characters via `/[\u0000-\u001F\u007F-\u009F  ]/g`; whitespace via `/\s+/g` (covers NBSP and line separators in JS); no `Intl`, no Unicode normalisation (NFC would silently change what the editor typed; not needed for a length bound). Tests in `packages/shared/src/event-location.test.ts` (`node:test` via `tsx`, the scaffolding spec 04 T1 adds; if 7 lands first, 7 adds it with the same shape).

### 6.6 Configuration

No new environment variables. Nothing to add to `docs/architecture/configuration.md`.

### 6.7 Security and privacy

- Bounded, single-line, control-character-free text at every write path (admin API, translation API, remote MCP, AI pipeline); the stdio MCP relies on the API.
- Rendered as a React text node (auto-escaped); never as Markdown or HTML; never as an `href`. Consumers that serialise it must escape it in their own format: XML in spec 02 (`escapeXml`), JSON-LD/HTML in spec 03 (its serialiser escapes `<`, `>`, `&`, U+2028/9), HTML attributes in spec 06, push payload JSON in spec 01.
- No new endpoints and no data about people (a venue is not personal data; editors should not type private addresses — mention in the hint? No: keep the UI quiet; note in the admin docs only).

### 6.8 Performance and caching

One extra ≤ 70-character key per card in `GET /api/content` and per translation row. No change to HTTP caching, service worker or indexes. One extra inline SVG per card (~300 bytes of DOM); no new dependency in the public bundle (hand-written path, as `ExternalLinkIcon`).

### 6.9 Why no ADR

The decisions that would warrant one are either already fixed by the coordination README (free text instead of a venue entity; Cards only; translatable per locale; 70-character bound) or already taken by an existing ADR: shared runtime helpers in `packages/shared` (ADR-023, decision 3) and read-time Romanian fallback for translations (ADR-014). What remains — soft/hard threshold, showing the row without a date, no link — are reversible product choices recorded as requirements and open questions here. ADR-026 stays free; if Q1 later turns the location into a map link, that is the moment for an ADR.

## 7. Contracts

**Provides**

| To | What |
|----|------|
| 1 PWA | `readLocation(data)` for the notification body; the precedence rule BR-053. Delta below. |
| 2 RSS | `readLocation(data)` for the `<description>` "where" line and `ev:location`. Delta below. |
| 3 SEO | `readLocation(data)` for `Event.location` → `Place.name`; the snapshot renders the row. Delta below. |
| 5 MCP | The `location` field delta on `create_card` / `update_card` on both surfaces (§6.2), `nullable()` on update, the three error strings. Delta below. |
| 6 Previews | `readLocation(data)` for the description fallback chain. Delta below. |
| all | `LOCATION_MAX_LENGTH`, `normalizeLocationText()`, `invalidLocation()` so nobody re-implements the bound. |

**Consumes**

- Spec 04: the card date/time row (`CardItem`) and the admin dates row (`ContentPage.tsx`) as anchors; the `null`-deletes-key path in remote `update_card`; the `packages/shared` test scaffolding. Spec 7's card row and admin input land **after** 04's (README → Delivery order 3). Nothing from 04's helpers is called.
- Spec 05: the shared tool contract `packages/shared/src/mcp-tools.ts` — if it has landed, the delta goes there; otherwise into the two current files and 05 carries it over when it moves the schemas.
- Existing domain docs: translation merge and fallback (ADR-014), duplication (BR-009). Nothing from specs 1, 2, 3, 6.

Matches the README ownership table: this spec owns `data.location`, its validation, the admin input below the dates section, the public row below the date/time row (own component) and the `location.` i18n prefix; it only adds a field to 5's tools and touches no route, `<head>`, feed or short-link code.

### Consumer deltas — ready to paste, applied by each owner, not by this spec

**Spec 01 (PWA) — FR-056 and §6.4 payload.** Append to FR-056 after "the 'when' text from `formatEventWhen()` …": *"; the 'where' text from `readLocation()` (`packages/shared/src/event-location.ts`, spec 07) on the locale-merged data (translated value with Romanian fallback), appended to the body after the when text as `" · {location}"` when present — e.g. `Seară de tineret — sâmbătă, 7 noiembrie, 19:00 · Sala mare`. The site name stays in the title; `data.location` never changes targeting."* Update the §6.4 example `body` accordingly and note that the ≤ 2 KB payload bound is unaffected (≤ 70 characters). In `buildNotificationText()` (§6.3 "Text helpers") add `location: readLocation({ ...item.data, ...translation?.data })`.

**Spec 02 (RSS) — §6.5 field rules and FR-061.** Replace the `<description>` rule's where clause with: *`"<feed.where>: <where>"` where `<where>` = `readLocation(item.data)` (spec 07, locale-merged by `listPublicContent`) when present, else the site line as before (`"<name> — <address>"` / `"<name>"` when exactly one site applies), else no line.* Replace the `ev:location` rule with: *Present when `readLocation(item.data)` is non-null (value: that text, XML-escaped) **or** when exactly one site applies (value: `"<name> — <address>"` / `"<name>"`); the location text takes precedence (README → Fixed contracts). `betel:site` keeps carrying the site(s) either way.* Add to the unit-test list (§9): "ev:location prefers `data.location` over the site; falls back to the site; absent when neither". Amend FR-061's parenthesis "`ev:location` when exactly one site applies" to "`ev:location` from `data.location` (spec 07) or, failing that, the single applicable site".

**Spec 03 (SEO) — §6.2.3 and BR-030.** Replace the **Event location** bullet with: *Which site is the event's place is resolved as before (`exclusiveSite`; else the site page; else a single-entry `sites[]`; else **no `Event`**). The emitted `location` is: when `readLocation(data)` (spec 07) is null → the resolved site's `Church` object expanded inline, as today; when non-null → `{ "@type": "Place", "name": "<location>", "address": <the resolved site's PostalAddress>, "containedInPlace": { "@id": "{base}/{slug}#place" } }` (no `geo`, `telephone` or `url` — the venue may be a room or a different building; the site's `Church` is still present on the page via `containedInPlace` and the footer). A location with **no** resolvable site still yields no `Event`: Google requires `location.address`, and a free-text venue has none (BR-030 unchanged in that respect).* Add to "Nothing hidden is marked up": *the content snapshot (`render-snapshot.ts`) prints the location row (map-pin text, i18n `location.label` default + the value) under the date line of each card so `Place.name` is visible without JS.* Append to BR-030: "`Event.location` is a `Place` named after `data.location` when the card has one (contained in the resolved site's `Church`), otherwise the `Church` itself." Add to the §9 Rich Results check: "an item with `data.location` validates with `Place.name` = the location and the site's address".

**Spec 05 (MCP) — §6.2 contract module.** Next to the "04 delta" line add: *"**07 delta (owned by 07-event-location.md):** `location` (`z.string().optional()` on `create_card`, `z.string().nullable().optional()` on `update_card`, descriptions in 07 §6.2) is added by 07 in this same contract module; handlers call `invalidLocation()` / `normalizeLocationText()` from `@betel/shared`."* In FR-048's amended tool field list (§12 of 05) add `location` after `startTime`; `get_item_stats` returns it as stored.

**Spec 06 (short-link previews) — §6.3 description chain.** Replace "When absent and `data.startDate` exists, use spec 04's 'when' formatter …" with: *When `data.description` is absent, the description is `[whenText, readLocation(data)].filter(Boolean).join(' · ')` — spec 04's "when" formatter in the chosen locale (date-only without `startTime`) followed by spec 07's location (locale-merged, Romanian fallback) — e.g. `vineri, 14 noiembrie 2026, 18:00 · Sala mare`; empty when neither exists (then `og:description` is omitted as today).* When `data.description` exists it is used unchanged (the location is not appended to an authored description).

## 8. Rollout

- **Flags:** none. The field is optional; cards without it are pixel-identical to today.
- **Migration:** none.
- **Deploy order:** (1) spec 04's card row and admin dates row merged (or this spec's T3/T4 rebased on them); (2) this feature — shared helper, API, app ship together in the single container (ADR-006); (3) stdio MCP package rebuilt from the same commit. An older stdio MCP against a newer API keeps working (it cannot set the field); a newer stdio MCP against an older API has `location` stored unvalidated for the minutes a deploy takes, and the next admin save normalises it.
- **Consumers:** specs 1, 2, 3 and 6 apply their deltas after `packages/shared/src/event-location.ts` exists (T1 is tiny; land it first). Until then they behave as written today (site as the place).
- **Rollback:** redeploy the previous image. Stored `location` values are ignored by the previous `CardItem` and survive for a later re-deploy. No data to revert.

## 9. Testing

Cypress specs stub the API, so backend behaviour is verified by unit tests (helper) and a manual checklist (routes, MCP, AI pipeline).

### 9.1 Unit — `packages/shared/src/event-location.test.ts`

- `normalizeLocationText`: trims; collapses `"Sala\n\t mare"` and NBSP runs to one space; strips `\u0000`, `\u001B`, `\u009F`, ` `; returns `""` for whitespace-only; leaves diacritics (`"Mănăștur"`) and punctuation intact; does not truncate.
- `invalidLocation`: `undefined`/`null` → null; `42`, `{}`, `[]`, `true` → `location must be a string`; 70 characters → null; 71 → the length message; 72 characters that normalise to 70 → null (measured after normalisation); `"a".repeat(69) + "😀"` (71 code units) → the length message.
- `readLocation`: `{ location: "  Sala mare " }` → `"Sala mare"`; `{ location: "" }`, `{ location: null }`, `{}`, `undefined`, `{ location: 5 }` → null.

### 9.2 Cypress — new `cypress/e2e/event-location.cy.ts`

Admin (setup as in `admin-content-form.cy.ts`):

1. **Happy flow:** card with title, date `2026-11-14`, location `Sala mare, etaj 1` → `POST` body `data.location === 'Sala mare, etaj 1'`; counter reads `17 / 70`; no soft hint.
2. **Placement:** `create-location-input` is rendered after `create-date-input` in DOM order (`cy.get('[data-testid="create-date-input"]').parents('div.flex').next()` contains the location input) and is absent for `poster`, `richtext` and `video` (`should('not.exist')` after selecting each type).
3. **Max length:** typing 80 characters leaves the input value at 70 characters and the counter at `70 / 70`; the `POST` body carries the 70-character string.
4. **Soft hint:** after 51 characters `create-location-soft-hint` is visible and the counter has the accent class; after deleting back to 50 the hint disappears.
5. **Whitespace → null:** typing `"   "` → `POST` body `data.location === null`; typing `"  Sala   mare  "` → `'Sala mare'`.
6. **Edit prefill and PATCH:** editing an item with `location: 'Parcul Central'` shows the input with that value; saving without changes sends `data.location === 'Parcul Central'`; clearing it sends `null` (regression guard for the partial-update family in `admin-content-form.cy.ts`).
7. **Translation mode** (extend `admin-content-translation.cy.ts`, `mockItem.data.location = 'Sala mare'`): selecting `en` shows `trans-location-input` with placeholder `Sala mare`, `maxLength` 70 and `trans-location-counter`; typing `Main hall` and saving sends `PUT …/translations/en` with `data.location === 'Main hall'`; leaving it empty omits `location` from the body.

Public (setup as in `content-types.cy.ts`, `stubI18nRoutes()`):

8. **With date (ro):** card `{ startDate: '2099-11-14', location: 'Sala mare' }` → `[data-testid="event-location"]` contains `Sala mare`, contains an `svg[aria-hidden="true"]`, has a `.sr-only` child with text `Loc de desfășurare`, and is the next element sibling of the date `<p>` (`cy.get('time').parent('p').next()` has the test id). Repeat in the horizontal variant (site view, `cy.visit('/<slug>')` with a stubbed site).
9. **Without date:** `{ title: 'Grup de rugăciune', location: 'Sala mică' }` → the row is visible; no `<time>` and no date `<p>` precede it (Q2 behaviour).
10. **Absent / empty:** `{ title, startDate }`, `{ title, location: '' }` and `{ title, location: '   ' }` → `event-location` does not exist.
11. **Translated (en):** `localStorage betel-lang = 'en'`, `/api/translations?locale=en` → `{ 'location.label': 'Venue' }`, `/api/content?locale=en` → `data.location: 'Main hall'` → row shows `Main hall`, `.sr-only` text `Venue`.
12. **Romanian fallback (en):** same but `/api/content?locale=en` returns `data.location: 'Sala mare'` (what the API serves when the English translation has no `location`) → row shows `Sala mare` with the English label. (The server-side merge itself is in the manual checklist; this asserts the UI renders the merged value and does not hide it in a non-Romanian locale.)
13. **Long text wraps:** a 70-character location on the `mobile` viewport (`cy.viewport(360, 740)`) renders fully (`should('contain', fullText)`) and the article's `scrollWidth` equals its `clientWidth` (no horizontal overflow).
14. **Not a link:** `event-location` contains no `a` element; a card with `link` is still wrapped in one anchor only.

### 9.3 Manual backend checklist (say so in the PR)

With `pnpm dev:api` and an admin token:

- `POST /api/admin/content` card with `location: "  Sala\n mare  "` → 201, `data.location === "Sala mare"`; with 71 characters → 400 `location must be at most 70 characters`; with `location: 7` → 400 `location must be a string`; poster with `location` → 400 `location is only supported on cards`; with `location: null` → 201 and no `location` key.
- `PATCH` with `{ data: { location: "Parc" } }` → 200 normalised; `{ data: { location: null } }` → key removed; `{ data: { location: "x".repeat(71) } }` → 400; `{ type: 'poster' }` on a card that has a location → 400.
- `PUT /api/admin/content/:id/translations/en` with `{ data: { title: 'T', location: 'x'.repeat(71) } }` → 400; with `location: '  '` → stored without the key; `GET /api/content?locale=en` then returns the Romanian location (fallback); after a valid English `location`, returns the English one.
- `POST /api/admin/content/:id/duplicate` on a located card → duplicate has `location`.
- With `OPEN_ROUTER_API_KEY`: create a card with `location: 'Sala mare'` → the `en` translation row gains a translated `location`; a forced over-long result (temporarily lower `LOCATION_MAX_LENGTH` locally) is dropped with a `location_dropped` log line.
- Remote MCP (`/mcp`): `create_card` with 71 characters → tool error; `update_card` with `location: null` clears it. Stdio MCP (`pnpm --filter @betel/mcp dev`): same two calls; the 400 is relayed.
- `GET /api/content` returns `location` on cards, verbatim.

## 10. Work breakdown

| # | Task | Files | Depends on |
|---|------|-------|------------|
| T1 | **Shared helper.** Create `packages/shared/src/event-location.ts` per §6.5; `export * from './event-location'` in `packages/shared/src/index.ts`; `event-location.test.ts` (§9.1). Uses the `tsconfig.json` / `lint` / `test` scaffolding spec 04 T1 adds to `packages/shared`; if 7 lands first, add that scaffolding exactly as 04 §10 T1 describes so 04 finds it in place. `pnpm lint` in all packages. | `packages/shared/src/event-location.ts`, `packages/shared/src/index.ts`, `packages/shared/src/event-location.test.ts` (+ 04's scaffolding files if absent) | — (land first; consumers 1, 2, 3, 6 wait on it) |
| T2 | **API validation.** `applyLocation()` in `POST` and the merged-data check in `PATCH` (§6.2); `PUT …/translations/:locale` normalisation and limit; `sanitizeTranslatedLocation()` + `SYSTEM_PROMPT` rule in `ai-translation.ts`; remote MCP `location` on `create_card` / `update_card` with validation and `null` deletion. Manual checklist §9.3. | `packages/api/src/routes/admin/content.ts`, `packages/api/src/services/ai-translation.ts`, `packages/api/src/routes/mcp.ts` (or `packages/shared/src/mcp-tools.ts` if 05 T1 has landed) | T1; 04 T2 for the `null`-deletes path in remote `update_card` (else add it here and 04 reuses) |
| T3 | **Admin form.** `FormData.location`, `itemToForm`, `formToPayload`, the location block below the dates row, `LocationCounter`, `TRANSLATABLE_FIELDS.card` entry and `maxLength`/counter support in the translation loop (§6.3). Cypress §9.2 items 1–7. | `packages/app/src/admin/pages/ContentPage.tsx` (+ optional `packages/app/src/admin/components/content/LocationCounter.tsx`), `cypress/e2e/event-location.cy.ts`, `cypress/e2e/admin-content-translation.cy.ts` | T1; **after 04 T3** (same file, dates row) |
| T4 | **Public card.** `EventLocation.tsx`, `CardItem` changes in both variants, `UI_KEYS.LOCATION_LABEL`, `KNOWN_KEYS['location.label']` (§6.4). Cypress §9.2 items 8–14. | `packages/app/src/public/components/content/EventLocation.tsx`, `packages/app/src/public/components/content/CardItem.tsx`, `packages/app/src/public/i18n/keys.ts`, `packages/app/src/admin/pages/TranslationsPage.tsx`, `cypress/e2e/event-location.cy.ts` | T1; **after 04 T4** (same file, date row) |
| T5 | **Stdio MCP delta.** `location` on `create_card` (`optional`) and `update_card` (`nullable().optional()`, forwarded as `data.location: null`) with the §6.2 descriptions. Two-field change inside spec 5's file; coordinate wording. Skipped if 05 T1 has already moved the schemas to `mcp-tools.ts` (then T2 covers it). | `packages/mcp/src/index.ts` | — (parallel with T2; same strings) |
| T6 | **Docs** — applied by the coordinator from §12 (requirements, content-model, business-rules, user-flows, roadmap, AGENTS.md code map, specs README). | `docs/**`, `AGENTS.md` | T2–T5 done |

T2, T3, T4 and T5 can run in parallel once T1 is merged and the 04 prerequisites are in. Branch: `feat/event-location`; commits e.g. `feat(shared): add event-location helpers`, `feat(api): validate and normalise card location`, `feat(ai-translation): translate and sanitise card location`, `feat(admin): location input for cards`, `feat(public): show event location under the card date`, `feat(mcp): accept location on card tools`, `test(content): cover event location`, `docs: …`.

## 11. Open questions

| # | Question | Recommended default |
|---|----------|---------------------|
| Q1 | Should the location be a link (Google/Apple Maps search, or a per-site map URL)? | **Not now — plain text.** Three reasons: the whole card is already an `<a>` when it has a link (`CardItem` lines 86–98, 141–152), and nested anchors are invalid HTML, so a map link would force a card-layout change; a search URL built from free text ("Sala mare") is useless for a room name and leaks the text to a third party; and the skill's "one accent element per card" is better spent on the CTA. If wanted later: add `data.locationUrl` (optional, validated URL) rendered as a small "Hartă" affordance outside the card anchor, and record it in an ADR. |
| Q2 | Show the row when the card has no date? | **Yes.** The value is explicit editor input, and undated cards are often standing activities tied to a place ("Grup de rugăciune — Sala mică"); hiding it would make the admin field look broken and the two rows are independent in the markup anyway. The row simply takes the date row's position when there is no date. |
| Q3 | Should posters (or other types) get a location later? | **No** (README: Cards only). Posters show no text at all; richtext/video carry no title/description contract. Revisit together with "posters show dates" (04 Q3). |
| Q4 | Hard limit 70 with a soft hint at 50, or hard 50? | **70 hard, 50 soft** — the owner's own numbers; 50 covers the common case on one phone line, 70 absorbs "venue, detail, street" without truncating; the soft hint keeps editors short without blocking them. |
| Q5 | Show the location in the admin content list row? | **Not in this spec.** The list shows no dates either; adding date/time/location to the row is one small UX change to do together (04 Q4). |
| Q6 | Uppercase, wide-tracked treatment like the date row, or sentence case? | **Same as the date row.** The owner asked for "similar to how Date is displayed"; two rows in one metadata style read as one block, and proper names survive uppercase. If it proves hard to read for long street names, drop `uppercase` on this row only (one class). |
| Q7 | Admin/public wording: "Loc de desfășurare" vs "Locație" vs "Unde". | **"Loc de desfășurare"** — "Locație" already means a church site throughout the admin and public UI (`Toate locațiile`, `Locații` page) and would be misread as site scope; "Unde" is too terse for a form label. Spec 02 keeps "Unde" as its short feed label; that is fine for a feed line. |
| Q8 | Should the AI translate the location at all (risk: street addresses "translated")? | **Yes, with the prompt rule in §6.2.** Venue nouns ("Sala mare" → "Main hall") are what visitors need; proper names and numbers are protected by the rule, and editors can correct in translation mode. |

## 12. Doc integration

Ready-to-paste snippets for the coordinator (not applied by this spec). BR-050–BR-053 come from this spec's reserved block.

### `docs/product/requirements.md` — "### Planned Features", new block after "#### Event Start Time" (README says planned FRs are applied now on the specs branch; this block is **missing today** — coordination note)

```markdown
#### Event Location
Spec: [07-event-location.md](specs/07-event-location.md).
- FR-090: Cards support an optional plain-text location `data.location` (max 70 characters after normalisation: control characters removed, whitespace collapsed, trimmed; empty means absent). `POST`/`PATCH /api/admin/content` and `PUT …/translations/:locale` normalise it and reject non-strings, over-long values and locations on non-card items with HTTP 400; `null` clears it. Rules: `docs/domain/content-model.md` — "Event location"; BR-050. **[Planned]**
- FR-091: The admin content form shows a "Loc de desfășurare (opțional)" input for cards directly below the dates row, with a 70-character `maxLength`, a live counter and a soft hint above 50 characters; the field is translatable in translation mode with the same limit. **[Planned]**
- FR-092: Public cards render the location as its own row directly below the date/time row (or in its place when the card has no date), in the same muted metadata style, with an inline map-pin glyph in `currentColor` (`aria-hidden`) and a visually-hidden label from i18n key `location.label`; the text wraps and is never a link. **[Planned]**
- FR-093: The location is translated per locale with Romanian fallback (ADR-014) and by the AI translation job (over-long or empty results are dropped, never stored); duplication copies it (BR-009). **[Planned]**
- FR-094: `@betel/shared` exports `LOCATION_MAX_LENGTH`, `normalizeLocationText`, `invalidLocation` and `readLocation` (`packages/shared/src/event-location.ts`), used by the API, the app, feeds, structured data, notifications and previews; `create_card`/`update_card` on both MCP surfaces accept `location` (`null` clears on update). **[Planned]**
```

Also append `location` to FR-048's tool field list when spec 5 updates it, and to FR-040/FR-041 (translatable card fields) if those enumerate fields.

### `docs/domain/content-model.md`

Under "### Card" → Fields, after "End date":
```markdown
  - Location — stored in `data.location`; optional plain text, max 70 characters, where the event takes place (see Event location)
```

In "## Shared Metadata" → **Locale**, replace "Text fields on content items and group names can be translated" with "Text fields on content items (including the card location `data.location`) and group names can be translated".

New subsection after "### Event start time (`data.startTime`)" (spec 04's block):
```markdown
### Event location (`data.location`)
Cards only. A plain-text, single-line place name or short address of at most 70 characters (UTF-16 code units) describing where the event takes place ("Sala mare, etaj 1"). Every write path normalises it (`normalizeLocationText()` in `@betel/shared`: control characters removed, whitespace runs collapsed, trimmed) and rejects non-strings, over-long values and locations on non-card items with HTTP 400 / an MCP tool error (BR-050); an empty value removes the key. It is translatable per locale like the other text fields, with Romanian fallback at read time, and the AI translation job drops translated values that break the rule (BR-051). Public cards show it as metadata under the date/time row with a map-pin glyph, whether or not the card has a date, never as a link (BR-052). It is only a human-readable place name: site scope, expiry, sorting and notification targeting ignore it, while feeds, structured data, notifications and link previews prefer it over the site name when present (BR-053).
```

Under "## Duplication → What is copied": add "`location` is copied with the other text fields."

### `docs/domain/business-rules.md`

Add:
```markdown
- BR-050: A card's location (`data.location`) is optional plain text of at most 70 characters after normalisation (control characters stripped, whitespace collapsed, trimmed). The admin API, the translation API and both MCP surfaces normalise it in place and reject non-strings, over-long values and locations on non-card items (HTTP 400 / MCP tool error); an empty value means "no location" and removes the key. It is never interpreted as Markdown or HTML and never rendered as a link.
- BR-051: The location is translated per locale like title, description and CTA, with Romanian fallback when a translation has no value. Translated values obey BR-050; the AI translation job discards any that do not, so the fallback applies instead of an invalid value.
- BR-052: Public cards render a present location as its own metadata row directly below the date/time row (or in its place for undated cards) with a map-pin glyph in the text colour and a screen-reader label (`location.label`); other content types never render it.
- BR-053: The location is a human-readable place name only. It never affects visibility, site scope, expiry, ordering or notification targeting; the site remains the entity for those. Consumers that name a place (feed `where` line and `ev:location`, JSON-LD `Event.location.name`, notification body, link-preview description) prefer the location over the site name when present and fall back to the site otherwise; postal addresses always come from the site.
```
and in "## Source": `- BR-050–BR-053 added: <date> (event location, FR-090–FR-094)`.

### `docs/product/user-flows.md` — append (spec 04 proposes Flow 8; coordinator assigns the next free number)

```markdown
### Flow 9 (Admin) — Stating where an event takes place

- Trigger: an admin publishes a card for an event held at a specific place (a hall, a park, another building)
- Steps:
  - The admin opens the content form, sets the title and "Dată"
  - Below the dates, the admin types the place into "Loc de desfășurare (opțional)" — a counter shows the length out of 70
  - The admin saves; the public card shows a map-pin row with the place under the date
  - Optionally, the admin switches the language dropdown and types the translated place name
- Success state: the location is stored on the card, translated per language (AI or manual) and used by feeds, notifications, previews and structured data as the human-readable place
- Failure or edge states:
  - The text passes 50 characters — the counter turns to the accent colour and a hint warns it will wrap on phones; typing stops at 70
  - The admin types only spaces — the field is saved as empty and no row is shown
  - The card has no date — the row is still shown, in the date row's place
```

### `docs/product/roadmap.md` — Phase 2 → "Next feature batch"

Change "Six specs" to "Seven specs" and append:
```markdown
- **Event location** — optional free-text venue on cards, shown under the date with a map pin. [07-event-location.md](specs/07-event-location.md), FR-090–FR-094.
```

### `docs/decisions/README.md`

No new row (no ADR; ADR-026 stays free).

### `AGENTS.md` — Code map

Extend spec 04's proposed row: `| Shared runtime helpers (event time, event location) | packages/shared/src/event-time.ts, packages/shared/src/event-location.ts |`.

### `docs/product/specs/README.md`

- "Fixed contracts → Event location": add the helper names (`normalizeLocationText`, `invalidLocation`, `readLocation`, `LOCATION_MAX_LENGTH = 70`), the three error strings of §6.2, the length measure (UTF-16 code units) and the copy decision ("Loc de desfășurare" — never "Locație", which means a site).
- "Integration of shared docs → Applied now": the FR-090–FR-094 block and the roadmap bullet for spec 7 are not yet applied on the specs branch (only the README rows are); apply them with the snippets above.
- "Delivery order" 3: add "7's `null`-deletes path in remote `update_card` is 04's; whichever lands first adds it".
