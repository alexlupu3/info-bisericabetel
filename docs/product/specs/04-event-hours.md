# 04 — Event hours: optional start time for single-day events

- **Owner area:** content model (event time), admin content edit form (dates section)
- **FR range:** FR-075 – FR-079
- **ADR:** [ADR-023](../../decisions/ADR-023-event-start-time-wall-clock.md) (Proposed)
- **Migration:** none (JSONB field)
- **Provides to:** 1 PWA (notification text), 2 RSS (item text, instants), 3 SEO (JSON-LD `startDate`), 5 MCP (card tool field delta)
- **Depends on:** the timezone policy from `fix/timezone-handling`, merged to `main` in PR #17 (see "Current state")

## 1. Summary

Events on the hub are day-granular: a card says "14 noiembrie" and nothing else, so editors put the hour into the title or description, where it is not machine-readable, not translated consistently and not available to feeds, notifications or structured data. This spec adds an optional **start time** (`data.startTime`, `HH:mm`, 24-hour, Europe/Bucharest wall clock) to the shared date fields of every content item, allowed only for **single-day** events (a `startDate` with no `endDate`, or an `endDate` equal to the `startDate`). Cards render it after the date in the visitor's language ("14 noiembrie · 18:00", "November 14 · 6:00 PM"); groups sort by date then time; expiry stays date-based. Two shared helpers in `@betel/shared` — a "when" text formatter and an ISO-8601 date-time builder with the correct Bucharest offset (DST-aware) — give specs 1, 2, 3 and 5 one implementation to consume.

## 2. Goals / Non-goals

**Goals**

- Let an admin optionally record the starting hour of a single-day event, in the same dates section of the content form, with the same progressive disclosure the end date already uses.
- Show that hour on public cards, formatted per language through `Intl`, without hard-coded strings.
- Keep the field consistent: it never survives on a multi-day event or on an item without a start date (admin form, API and MCP all enforce the same rule).
- Make date + time usable as a sort key (groups) and as an instant (feeds, JSON-LD, notifications) through shared helpers.

**Non-goals**

- End time, duration, time ranges, or times on multi-day events ("at least yet", per the product owner). The data model leaves room for `data.endTime` later; nothing here depends on its absence.
- Changing when an item expires or disappears from the hub (see FR-078 and open question Q1).
- Per-site or per-locale times: like dates, the time is shared across all locales and sites (`content-model.md` → Shared Metadata → Locale).
- Recurring events, calendar export (`.ics`), reminders.
- Any schema migration: `data` is JSONB.

## 3. Current state

- **Fields.** `data.startDate` / `data.endDate` are `YYYY-MM-DD` strings on all four content types (`docs/domain/content-model.md` → Expiration Behavior). They are stored as-is; the admin form writes them via `formToPayload()` in `packages/app/src/admin/pages/ContentPage.tsx` (form fields `date`, `endDate`; `null` clears), with the end-date input hidden until a start date exists (progressive disclosure) and cleared when the start date is cleared.
- **Rendering.** Only `CardItem` (`packages/app/src/public/components/content/CardItem.tsx`, `formatDateRange()`) renders dates: `{ day: 'numeric', month: 'long' }` in `dateLocale` from `useLanguage()` (`ro-RO`, `en-US`, `de-DE`, `hu-HU` map in `public/context/LanguageContext.tsx`). Posters, richtext and video items store dates but never display them.
- **Expiry.** `GET /api/content` (`packages/api/src/routes/content.ts`) hides items after `endDate` (else `startDate`) compared with "today" in Europe/Bucharest; the client mirrors this (`isItemPast()`), BR-014.
- **Sort.** BR-013 / FR-046: `sortGroupByStartDate()` in `packages/api/src/services/group-order.ts` and `sortByStartDate()` in `ContentPage.tsx` (two copies of the same comparator) sort by the `startDate` string, stable, undated last.
- **Duplicate.** `POST /api/admin/content/:id/duplicate` copies every `data` key except media fields (BR-009), so a new key is copied automatically.
- **Translation.** `TRANSLATABLE_FIELDS` in `ContentPage.tsx` lists text keys only; `scheduleContentTranslation()` (`packages/api/src/services/ai-translation.ts`) passes the whole `data` object to the model with a prompt rule to translate natural-language fields only, exactly as it already does for `startDate`.
- **MCP.** `create_card` / `update_card` exist on both surfaces (`packages/api/src/routes/mcp.ts` writes the DB directly; `packages/mcp/src/index.ts` calls the HTTP API) with `startDate` / `endDate` as plain optional strings.
- **Shared package.** `packages/shared/src/index.ts` holds types only. It is a workspace dependency of `@betel/app` and `@betel/api` (`"exports": { ".": "./src/index.ts" }`). Verified while writing this spec: a runtime import from `@betel/shared` type-checks under the API's `NodeNext` tsconfig, runs under `tsx`, and is inlined by the API's `esbuild --bundle` build, so shared runtime helpers need no build changes. `@betel/mcp` does not depend on it today; spec 05's T1 adds the dependency (and esbuild bundling for the stdio package) together with the shared tool contract `packages/shared/src/mcp-tools.ts`, which is where this spec's MCP field delta lives (see §6.2).
- **Timezone policy (`fix/timezone-handling`, merged to `main` in PR #17).** This spec builds on:
  - `packages/api/src/services/time.ts`: `CHURCH_TIME_ZONE`, `isCalendarDay()`, `invalidEventDate()` (returns a 400 message for malformed `startDate`/`endDate`), `startOfDayIn()` (DST-aware), `parseExpiresAt()`; wired into `POST`/`PATCH /api/admin/content` and the remote MCP zod schemas (`calendarDaySchema`).
  - `packages/app/src/dates.ts` (`formatCalendarDay()` — formats a `YYYY-MM-DD` in UTC so the day never shifts) and `packages/app/src/content-expiry.ts` (`isItemPast()` shared by admin badge and public safety net). `CardItem` now uses `formatCalendarDay`.
  - Docs: **ADR-017 "Time zone policy"** and **BR-015** (event days belong to the church; stored timestamps are UTC). This spec references ADR-017/BR-015 as the timezone policy.
  - `pnpm test:unit` (`tsx --test` in `@betel/api`) for pure helpers.

  All of this is on `main`; task T0 only confirms the baseline.

## 4. User flows

### Admin — adding a start time to an event

- Trigger: an editor creates or edits a card for a single-evening event.
- Steps:
  1. Opens the content form, fills the title, picks "Dată" = the event day.
  2. The "Până la" (end date) input appears (existing behaviour) **and** an "Ora de început" time input appears beside it.
  3. Types `18:00` (native `<input type="time">`, 24-hour in Romanian browsers).
  4. Saves. The payload carries `data.startTime: "18:00"`.
  5. The public card shows "14 noiembrie · 18:00".
- Variations:
  - The editor later sets "Până la" to a **different** day → the time input disappears and the time is cleared (the saved payload sends `startTime: null`). A muted hint explains why.
  - The editor sets "Până la" equal to the start date → still single-day; the time input stays.
  - The editor clears "Dată" → end date and time are both cleared (existing pattern extended).
  - Translation mode (language dropdown set to another locale): dates and time are not shown — they are shared across locales (FR-039).
- Failure states: the API answers 400 if a client sends a time without a date, on a multi-day event, or in another format; the form shows the error as it does today (the admin form itself never produces those payloads).

### Public visitor

- Opens the hub in any language. A single-day card with a time shows the date line as "{date} · {time}", both localised by `Intl` (`ro`: "14 noiembrie · 18:00"; `en`: "November 14 · 6:00 PM"; `de`: "14. November · 18:00"; `hu`: "november 14. · 18:00"). Multi-day cards and cards without a time look exactly as today. The time is always the Romanian wall clock, whatever the visitor's own time zone (a visitor in Chicago sees "18:00", not "11:00").
- Crawlers / AI agents: spec 3's JSON-LD `Event.startDate` and spec 2's feed items get a precise instant (`2026-11-14T18:00:00+02:00`) when a time exists and a plain date otherwise — through this spec's helpers, not their own parsing.

### AI agent (MCP)

- Calls `create_card` with `startDate: "2026-11-14", startTime: "18:00"`. If it also passes `endDate: "2026-11-15"`, the tool returns an error naming the rule. `update_card` with `startTime: null` clears the time.

## 5. Requirements

- **FR-075 — Start time field and validation.** Every content item's shared date fields gain an optional `data.startTime`: a string `HH:mm`, 24-hour (`00:00`–`23:59`), meaning the local wall-clock time in Europe/Bucharest on `data.startDate`. It is valid only when `data.startDate` is set and the item is single-day (`data.endDate` absent or equal to `data.startDate`). `POST` and `PATCH /api/admin/content` validate the **resulting** data (after the PATCH merge) and answer `400 { error }` with one of three messages (see §6.2) when the invariant is broken; `null` clears the field. The remote MCP `create_card`/`update_card` apply the same rule and return a tool error; the stdio MCP relays the API's 400. Testable: a PATCH that sets `endDate` to a different day while `startTime` is stored is rejected; the same PATCH with `startTime: null` succeeds.
- **FR-076 — Admin form.** In the dates row of the content form, a time input labelled "Ora de început (opțional)" is shown only while the form's start date is set and the end date is empty or equal to it. Clearing the start date, or setting a different end date, hides the input and clears its value; a muted hint below the end-date input explains that the start time applies to single-day events only. The time is pre-filled when editing, is not shown in translation mode, and the payload always carries `data.startTime` (`"HH:mm"` or `null`), so PATCH semantics mirror `startDate`/`endDate`. Admin copy is Romanian.
- **FR-077 — Public rendering.** `CardItem` renders the date line through the shared formatter: single-day items with a time show "{date}{separator}{time}" with both parts produced by `Intl.DateTimeFormat` in the visitor's language (`dateLocale`) and the time always expressed in Europe/Bucharest; items without a time, and multi-day items, render exactly as today. The date line is wrapped in `<time dateTime="…">` carrying the ISO-8601 value from the shared builder for single-day items. No new UI strings are introduced; nothing is hard-coded per language. Posters, richtext and video items do not start rendering dates or times.
- **FR-078 — Expiry, sort and duplicate.** (a) `startTime` does **not** affect expiry: an item stays visible through the end of its last day in Romania (BR-015) even after its start time has passed; neither the SQL filter nor `isItemPast()` reads `startTime`. (b) Chronological group sort (BR-013, FR-046) orders by `startDate` ascending, then within one date by `startTime` ascending with untimed items first, stable otherwise — identically in the admin "Sortează cronologic" button, the server-side re-sort on create (`resortGroupChronologically`) and the remote MCP `create_card`. `compareEventSchedules()` is the **only** chronological ordering of dated items in the product: the RSS feed (spec 02) and every other consumer that orders events use the same comparator, so untimed items come first on their date everywhere and no consumer defines its own tie-break. (c) Duplicating an item copies `startTime` like every other non-media `data` key (BR-009); no change to the endpoint.
- **FR-079 — Shared helpers and MCP delta.** `@betel/shared` exports the event-time helpers in §6.5 (validation, sort key/comparator, DST-aware instant and ISO builder, per-locale "when"/time formatters), unit-tested, used by the API, the app and available to specs 1, 2, 3 and 5. Both MCP surfaces' `create_card` and `update_card` accept an optional `startTime` (`HH:mm`; `update_card` also accepts `null` to clear) and document the single-day rule in the field description. The field is declared once, in spec 05's shared tool contract `packages/shared/src/mcp-tools.ts`, with a zod schema built on `isClockTime` from `@betel/shared`; neither transport (`routes/mcp.ts`, `packages/mcp`) carries its own copy of the clock regex, and the remote handlers call `invalidStartTime` from the same package.

## 6. Design

### 6.1 Data model

`content_items.data` (JSONB), all types:

| Key | Type | Rule |
|-----|------|------|
| `startDate` | `YYYY-MM-DD` | existing (BR-015) |
| `endDate` | `YYYY-MM-DD` | existing; requires `startDate` |
| `startTime` | `HH:mm` (`^([01]\d\|2[0-3]):[0-5]\d$`) | **new**; requires `startDate`; requires `endDate` absent or `endDate === startDate` |

Semantics: `startTime` is the wall-clock time in `Europe/Bucharest` on the calendar day `startDate`. The instant it denotes is derived, never stored (`eventStartInstant()`). Absent means "all day / time unknown"; every consumer renders date-only in that case (README fixed contract). Seconds are not accepted (`18:00:00` → 400) to keep the string canonical for comparison and the native time input emits `HH:mm` when `step="60"`.

No migration. Existing rows have no `startTime` and are unaffected. `content_translations.data` never carries `startTime` (dates and times are shared across locales); the public route's translation merge therefore leaves it untouched.

### 6.2 API

**Validation seam** (after `invalidEventDate()` in `packages/api/src/services/time.ts` on `main`):

- `POST /api/admin/content`: `invalidStartTime(data)` → `400 { error }`.
- `PATCH /api/admin/content/:id`: compute `mergedData` as today (null deletes), then `invalidStartTime(finalData)` → `400 { error }`. Validating the merged result is what makes "admin later adds a different endDate" or "clears startDate" deterministic: the admin form sends `startTime: null` alongside, so it succeeds; a raw API/MCP caller that forgets gets a 400 rather than a silently inconsistent row. (Rejected alternative: auto-clear `startTime` server-side. It hides data loss from the caller and makes PATCH non-idempotent in a surprising way; open question Q2.)

Error messages (English, fixed strings so Cypress/MCP tests can assert them):

| Condition | `error` |
|-----------|---------|
| not matching `HH:mm` (including `""`, `18:00:00`, `6pm`) | `startTime must be a 24-hour clock time in HH:mm format` |
| `startTime` set, `startDate` absent | `startTime requires startDate` |
| `startTime` set, `endDate` set and different from `startDate` | `startTime is only allowed for single-day events (no endDate, or endDate equal to startDate)` |

Checks run in that order; `undefined`/`null` `startTime` skips all three (`null` means "clear", as for dates).

**Public API.** `GET /api/content` returns `data` verbatim; no change. The expiry `CASE` is untouched (FR-078a). HTTP caching (ADR-013) unchanged.

**Group sort.** `sortGroupByStartDate()` in `services/group-order.ts` delegates to `compareEventSchedules()` from `@betel/shared` (rename to `sortGroupChronologically()` is optional; keep the export name if other code references it). Semantics: key `startDate` + (`startTime` ? `T` + `startTime` : `""`), string comparison, undated last, stable. Because `"2026-11-14" < "2026-11-14T09:00"`, untimed items on a date sort before timed ones (calendar convention: all-day entries on top). The `resortGroupChronologically()` transaction and advisory lock are unchanged. The same comparator orders the RSS feed items (spec 02 sorts with `compareEventSchedules`, then display order as the final tie-break) — there is no "untimed last" variant anywhere.

**Duplicate.** No change; `startTime` is copied. Document in BR-009's prose only.

**MCP tool contract** — field delta only (spec 5 owns the surface). The two fields below are declared once in `packages/shared/src/mcp-tools.ts` (spec 05 T1, "04 delta") and registered from there by both transports; if this spec lands before 05 T1, they go into `routes/mcp.ts` temporarily and 05 moves them. In either case the schema is built on the shared helper, never on a copied regex:

```ts
import { isClockTime } from '@betel/shared'
const clockTimeSchema = z.string().refine(isClockTime, 'must be a 24-hour clock time in HH:mm format')
// create_card
startTime: clockTimeSchema.optional().describe('Start time HH:mm (24-hour, Romania local time). Only for single-day events: requires startDate and no endDate (or endDate equal to startDate).'),
// update_card
startTime: clockTimeSchema.nullable().optional().describe('New start time HH:mm (Romania local time), or null to clear. Only for single-day events.'),
```

**Remote handlers (`routes/mcp.ts`)**: `create_card` sets `data.startTime` when provided, then `const e = invalidStartTime(data); if (e) return err(e)` before the insert. `update_card`: `null` deletes the key from `mergedData` (today the handler spreads `dataFields` over `existing.data`; it must `delete mergedData.startTime` for `null`), then `invalidStartTime(mergedData)` → `err(e)` before the update. Audit/translation scheduling unchanged (`startTime` appears in `changedKeys` like `startDate` does today).

**Stdio MCP (`packages/mcp/src/index.ts`)** — registers the same two fields from the shared contract (so it validates with the same `isClockTime`-based schema once 05 T1 has added the `@betel/shared` dependency); until then it declares `startTime` as a plain `z.string()` / `z.string().nullable()` with the same descriptions and **no local regex** — a copy would drift from the shared helper, and the API answers with the §6.2 400 anyway. `update_card` forwards `startTime: null` inside `data` so the API clears it. Validation errors come back as the API's 400 and are relayed as today. The stdio package never runs `invalidStartTime` itself: it is an adapter (ADR-024), and the single-day rule stays on the API.

### 6.3 Admin UI (`packages/app/src/admin/pages/ContentPage.tsx`)

Follow the `frontend-design` skill: same input styling as the date inputs (`bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-base font-content`), uppercase tracking-widest labels, muted hints; no new colours.

- `FormData` gains `startTime: string`. `itemToForm`: `startTime: d.startTime ?? ''`. `formToPayload`: 
  ```ts
  const singleDay = !!f.date && (!f.endDate || f.endDate === f.date)
  data.startTime = singleDay && f.startTime ? f.startTime : null
  ```
- Dates row (currently `flex gap-3` with "Dată (opțional)" and the conditional "Până la (opțional)"): add a third conditional column rendered when `form.date && (!form.endDate || form.endDate === form.date)`:
  ```tsx
  <div className="flex-1">
    <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">Ora de început (opțional)</label>
    <input type="time" step="60" value={form.startTime} onChange={e => set({ startTime: e.target.value })}
      data-testid="create-start-time-input"
      className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-base font-content" />
    <p className="mt-1 text-xs text-[var(--muted)] font-content">Ora României, doar pentru evenimente de o singură zi.</p>
  </div>
  ```
  On narrow screens the row should wrap (`flex-wrap`, each column `min-w-[10rem]`) so three inputs do not squeeze below usable width.
- State transitions (extend the existing handlers):
  - start date change: `set({ date: v, endDate: v ? form.endDate : '', startTime: v && (!form.endDate || form.endDate === v) ? form.startTime : '' })`
  - end date change: `set({ endDate: v, startTime: !v || v === form.date ? form.startTime : '' })`
- Hint when the time input is hidden because of a multi-day range (`form.date && form.endDate && form.endDate !== form.date`), under the "Până la" input: `<p data-testid="start-time-multiday-hint" className="mt-1 text-xs text-[var(--muted)] font-content">Ora de început se poate seta doar pentru evenimente de o singură zi.</p>`
- Translation mode: unchanged — the dates row is already inside the non-translating branch.
- `sortByStartDate()` (client-side preview of the chronological sort) delegates to `compareEventSchedules()` so the optimistic order matches the server.
- The content list row does not show dates today and does not start showing times (out of scope).

### 6.4 Public UI (`packages/app/src/public/components/content/CardItem.tsx`)

- `CardData` gains `startTime?: string`.
- Replace `formatDateRange(d.startDate ?? d.date, d.endDate, dateLocale)` with:
  ```ts
  const schedule = { startDate: d.startDate ?? d.date, endDate: d.endDate, startTime: d.startTime }
  const whenStr = formatEventWhen(schedule, dateLocale)           // null when no startDate
  const whenIso = isSingleDayEvent(schedule) ? eventStartIso(schedule.startDate!, schedule.startTime) : undefined
  ```
  and render, in both variants:
  ```tsx
  {whenStr && (
    <p className="text-[10px] tracking-widest uppercase font-content mb-2 text-[var(--muted)]">
      {whenIso ? <time dateTime={whenIso}>{whenStr}</time> : whenStr}
    </p>
  )}
  ```
  The existing class list (uppercase, tracking-widest, muted) is kept; `formatEventWhen`'s default date options are `{ day: 'numeric', month: 'long' }` — the same as today's `formatDateRange`, so cards without a time are pixel-identical. The default separator is `" · "` (middle dot, U+00B7); it is a punctuation glyph, not a translatable string.
- Delete the local `formatDateRange()`; `formatCalendarDay` in `packages/app/src/dates.ts` stays for the admin charts.
- No i18n key is needed: every word comes from `Intl`. (If a product decision later wants a "la"/"at" word, it goes through `UI_KEYS` and `t()`, never inline.)

### 6.5 Shared helpers — `packages/shared/src/event-time.ts` (re-exported from `packages/shared/src/index.ts`)

Pure, dependency-free, `Intl`-only, importable by the app (browser), the API (Node) and any future package. Exact public surface:

```ts
/** IANA zone every event wall-clock value is anchored to (ADR-017 / BR-015). */
export const CHURCH_TIME_ZONE = 'Europe/Bucharest'

/** The shared date fields of a content item (`data.startDate` / `data.endDate` / `data.startTime`). */
export interface EventSchedule {
  startDate?: string | null   // YYYY-MM-DD
  endDate?: string | null     // YYYY-MM-DD
  startTime?: string | null   // HH:mm, 24-hour, Bucharest wall clock
}

export const CLOCK_TIME_PATTERN: RegExp   // /^([01]\d|2[0-3]):[0-5]\d$/

/** True for a canonical "HH:mm" string. */
export function isClockTime(value: unknown): value is string

/** True when startDate is set and endDate is absent or equal to it. */
export function isSingleDayEvent(schedule: EventSchedule): boolean

/**
 * Validation for data.startTime. Returns null when valid or absent (undefined/null),
 * otherwise one of the three fixed messages in §6.2 (in that order of precedence).
 * Assumes dates were already validated by invalidEventDate().
 */
export function invalidStartTime(schedule: EventSchedule): string | null

/**
 * The instant at which the event starts: `startDate` at `startTime` on the wall clock of
 * `timeZone` (default CHURCH_TIME_ZONE), or the start of that day when startTime is absent.
 * DST-aware: a wall-clock time that does not exist (spring-forward gap) resolves one hour
 * later; an ambiguous one (autumn overlap) resolves to the later, standard-time instant.
 * Throws RangeError on a malformed startDate/startTime.
 */
export function eventStartInstant(startDate: string, startTime?: string | null, timeZone?: string): Date

/**
 * ISO-8601 for consumers that need a string: "2026-11-14T18:00:00+02:00" (offset of
 * `timeZone` at that instant, "+03:00" in summer) when startTime is present, else the
 * date-only "2026-11-14". Suitable for schema.org Event.startDate and <time dateTime>.
 */
export function eventStartIso(startDate: string, startTime?: string | null, timeZone?: string): string

/** "+02:00" / "+03:00": the UTC offset of `timeZone` at `at`, formatted ±HH:MM. */
export function utcOffsetAt(at: Date, timeZone?: string): string

export interface FormatEventWhenOptions {
  /** Intl options for the date part(s). Default { day: 'numeric', month: 'long' }. */
  dateOptions?: Intl.DateTimeFormatOptions
  /** Intl options for the time part. Default { hour: 'numeric', minute: '2-digit' }. */
  timeOptions?: Intl.DateTimeFormatOptions
  /** Between date and time. Default " · ". */
  separator?: string
  /** Between the two dates of a range. Default " – " (en dash). */
  rangeSeparator?: string
  /** Zone the time is expressed in. Default CHURCH_TIME_ZONE. */
  timeZone?: string
}

/**
 * Human text for "when": null without startDate; "{start}{rangeSeparator}{end}" for a
 * multi-day range; "{date}" for a single day without time; "{date}{separator}{time}" with
 * time. Date parts are formatted as calendar days (no zone shift); the time part is the
 * Bucharest wall clock formatted in `locale` (BCP-47, e.g. "ro-RO", "en-US"), so hour
 * cycle and AM/PM follow the language. Never throws on malformed input: falls back to the
 * raw strings so one bad legacy row cannot break a page.
 */
export function formatEventWhen(schedule: EventSchedule, locale: string, options?: FormatEventWhenOptions): string | null

/** Just the time part ("18:00", "6:00 PM"); null when absent or not single-day. */
export function formatEventTime(schedule: EventSchedule, locale: string, options?: Pick<FormatEventWhenOptions, 'timeOptions' | 'timeZone'>): string | null

/**
 * Sort key for BR-013: "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"; null when undated.
 * Plain string order gives date ascending, then untimed before timed, then time ascending.
 */
export function eventSortKey(schedule: EventSchedule): string | null

/** Comparator for Array.prototype.sort implementing BR-013 (undated last, 0 for ties → stable). */
export function compareEventSchedules(a: EventSchedule, b: EventSchedule): number
```

Implementation notes (for the developer; mirror `startOfDayIn()` / `offsetMs()` in `packages/api/src/services/time.ts` on `main` so the two agree):

- Offset: `Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year, month, day, hour, minute, second }).formatToParts(at)` → wall-clock parts → `Date.UTC(parts) - at` (rounded to the second).
- Instant from wall clock: `wall = Date.UTC(y, m-1, d, hh, mm)`; `guess = wall - offset(wall)`; `result = wall - offset(guess)`. This yields the behaviour documented on `eventStartInstant` for the 2026-03-29 gap and the 2026-10-25 overlap.
- Date part of `formatEventWhen`: format `new Date(`${day}T00:00:00Z`)` with `{ ...dateOptions, timeZone: 'UTC' }` (the day never shifts), as `formatCalendarDay()` does.
- Time part: `new Intl.DateTimeFormat(locale, { ...timeOptions, timeZone }).format(eventStartInstant(startDate, startTime, timeZone))`.
- Cache `Intl.DateTimeFormat` instances per `locale + JSON(options)` in a module-level `Map` (cards re-render often; constructing formatters is the only measurable cost).
- Node and modern browsers ship full ICU; no polyfill.

Expected outputs (also the unit-test table):

| `startDate` | `startTime` | `eventStartIso` | `formatEventWhen` ro-RO | en-US | de-DE |
|---|---|---|---|---|---|
| 2026-11-14 | 18:00 | `2026-11-14T18:00:00+02:00` | `14 noiembrie · 18:00` | `November 14 · 6:00 PM` | `14. November · 18:00` |
| 2026-07-01 | 09:30 | `2026-07-01T09:30:00+03:00` | `1 iulie · 09:30` | `July 1 · 9:30 AM` | `1. Juli · 09:30` |
| 2026-11-14 | — | `2026-11-14` | `14 noiembrie` | `November 14` | `14. November` |
| 2026-11-14, end 2026-11-16 | (invalid) | n/a | `14 noiembrie – 16 noiembrie` | `November 14 – November 16` | … |
| 2026-03-29 | 03:30 (gap) | `2026-03-29T04:30:00+03:00` | | | |
| 2026-10-25 | 03:30 (overlap) | `2026-10-25T03:30:00+02:00` | | | |

(Exact Intl spellings — "09:30" vs "9:30" for `ro-RO` with `hour: 'numeric'` — must be asserted from the real ICU output when the tests are written; the table shows the intent, not golden strings.)

Why `packages/shared`: the same rule must run in the browser (admin preview, card rendering), the API (validation, sort, feeds, JSON-LD, notifications) and must not drift into three copies as the `startDate` comparator already has (two copies today). The package is already a dependency of both and bundles cleanly (see Current state). ADR-023 records this and the wall-clock storage decision. `CHURCH_TIME_ZONE` will then exist in three places (`api/services/time.ts`, `app/dates.ts`, shared); task T7 makes the first two re-export the shared constant.

### 6.6 Configuration

No new environment variables. Nothing to add to `docs/architecture/configuration.md`.

### 6.7 Security and privacy

`startTime` is validated against one fixed regex (`isClockTime` in `@betel/shared`) at every write path (admin API, remote MCP, stdio MCP through the shared contract schema or the relayed API 400) and is at most five characters; it is rendered as text. No new endpoints, no new data about people.

### 6.8 Performance and caching

One extra five-character key per item in `GET /api/content`. Formatter instances are cached per locale. No change to HTTP caching, service worker or database indexes.

## 7. Contracts

**Provides**

| To | What |
|----|------|
| 1 PWA | `formatEventWhen(schedule, locale)` / `formatEventTime()` for notification bodies; `eventStartInstant()` if a send is scheduled relative to the event. |
| 2 RSS | `compareEventSchedules()` for the item order (date, then untimed first, then time; the feed adds display order as its final tie-break — no feed-specific rule); `eventStartInstant()` (→ `toUTCString()` for RFC 822 fields) and `formatEventWhen()` for item titles/descriptions. Date-only events yield the start of the day in Bucharest. |
| 3 SEO | `eventStartIso()` for JSON-LD `Event.startDate` (date-only or offset date-time, both valid schema.org `Date`/`DateTime`); `endDate` stays the stored `YYYY-MM-DD`. |
| 5 MCP | The `startTime` field delta on `create_card`/`update_card` (§6.2), declared in 05's shared contract `packages/shared/src/mcp-tools.ts` with the `isClockTime`-based `clockTimeSchema`, including `nullable()` on update; the error strings in §6.2. |
| all | The `EventSchedule` type and `isSingleDayEvent()` / `invalidStartTime()` so nobody re-implements the single-day rule. |

**Consumes**

- Timezone policy and `YYYY-MM-DD` validation on `main` (PR #17; ADR-017, BR-015, `invalidEventDate()`): this spec's validation runs after it and assumes dates are canonical.
- "What is an event / which are upcoming": unchanged domain docs (`content-model.md` → Expiration Behavior). This spec does not redefine upcoming-ness.
- Spec 05: the shared tool contract `packages/shared/src/mcp-tools.ts` (and the `@betel/shared` dependency of `packages/mcp`) as the home of the `startTime` field delta — if it has landed, the delta goes there; otherwise into `routes/mcp.ts` and 05 carries it over when it moves the schemas.
- Nothing from specs 1, 2, 3, 6.

Matches the README ownership table: this spec owns `data.startTime`, the formatter, the ISO builder and the admin dates section; it only adds a field to 5's tools and touches no `<head>`, manifest, route or short-link concern.

## 8. Rollout

- **Flags:** none. The field is optional; nothing changes for items without it.
- **Migration:** none.
- **Deploy order:** (1) `fix/timezone-handling` — done, merged in PR #17; (2) this feature (shared + API + app ship together in the single container, ADR-006 — the remote MCP endpoint lives in that same process, so API and remote MCP can never skew); (3) the stdio MCP package rebuilt from the same commit (`packages/mcp`, a private tool released from this repository via `pnpm --filter @betel/mcp build`). **Rule: deploy the API before publishing or using a stdio MCP build from the same or a newer commit; never point a newer stdio build at an older API.** An older stdio build against a newer API keeps working (it just cannot set the field). No capability detection or version negotiation is added — the deploy order is the contract.
- **Rollback:** redeploy the previous image. Stored `startTime` values are ignored by the previous `CardItem` and sort code and survive for a later re-deploy. No data to revert.

## 9. Testing

Cypress specs stub the API, so backend behaviour is verified by unit tests (helpers) and a manual checklist (routes).

### 9.1 Unit (new `pnpm test:unit` coverage)

`packages/shared/src/event-time.test.ts` (`node:test` via `tsx`, same runner as `packages/api/src/services/time.test.ts` on `main`):

- `isClockTime`: accepts `00:00`, `23:59`, `09:05`; rejects `24:00`, `9:05`, `18:00:00`, `""`, `18.00`, numbers.
- `invalidStartTime`: the three messages and their precedence; `null`/`undefined` pass; `endDate === startDate` passes.
- `eventStartInstant` / `eventStartIso` / `utcOffsetAt`: winter (`+02:00`), summer (`+03:00`), gap and overlap rows from the §6.5 table; date-only → `YYYY-MM-DD` and midnight Bucharest (`2026-11-13T22:00:00.000Z` for 2026-11-14).
- `formatEventWhen` / `formatEventTime`: ro-RO, en-US, de-DE, hu-HU for timed, untimed, range; malformed input falls back to raw strings and does not throw.
- `eventSortKey` / `compareEventSchedules`: undated last; same date untimed first; `09:00` before `18:00`; equal keys return 0.

### 9.2 Cypress — new `cypress/e2e/event-start-time.cy.ts`

Admin (setup as in `admin-content-form.cy.ts`):

1. **Progressive disclosure:** no `create-start-time-input` before a date; appears after typing a date; stays when end date equals the date; disappears and `start-time-multiday-hint` appears when end date differs; reappears (empty) when the end date is cleared.
2. **Create payload:** card with date `2026-11-14`, time `18:00` → `POST` body `data.startTime === '18:00'`.
3. **Clear on multi-day:** set time, then end date `2026-11-16` → `POST` body `data.startTime === null`.
4. **Clear with date:** set date + time, clear the date → body has `startDate: null`, `endDate: null`, `startTime: null`.
5. **Edit prefill:** editing an item with `startTime: '18:00'` shows the input with value `18:00`; editing a multi-day item shows the hint and no input; saving without touching sends `startTime: null` for the multi-day item and `'18:00'` for the single-day one (PATCH body assertions — regression guard for the partial-update bug family in `admin-content-form.cy.ts`).
6. **Translation mode:** switching the language dropdown hides the dates row including the time input (extend the existing translation-mode spec or assert here).

Public (setup as in `content-types.cy.ts`, `stubI18nRoutes()` from `cypress/support/helpers/i18n.ts`):

7. **Romanian:** card `{ startDate: '2099-11-14', startTime: '18:00' }` → date line contains `14 noiembrie` and `18:00`, and `time[datetime="2099-11-14T18:00:00+02:00"]` exists.
8. **English:** `localStorage betel-lang = 'en'` → contains `November 14` and `6:00 PM`.
9. **No time:** `{ startDate: '2099-11-14' }` → `14 noiembrie`, no separator, `time[datetime="2099-11-14"]`.
10. **Multi-day with stray time** (defensive; API should never store it): `{ startDate, endDate: '2099-11-16', startTime: '18:00' }` → renders the range only, no time, no `<time>`.
11. **Expiry unchanged (regression):** with `cy.clock` at 20:00 Bucharest on a day, a card `{ startDate: today, startTime: '18:00' }` is still visible (pattern from `timezone-handling.cy.ts` on `main`).

Group sort (extend `cypress/e2e/admin-group-chronological-order.cy.ts`):

12. **Tie-break:** items on `2026-03-01` at `18:00`, `09:00` and untimed, listed out of order → "Sortează cronologic" sends `order` = `[untimed, 09:00, 18:00]` and undated items still last.
13. **Create in group:** creating a `2026-03-01 09:00` item lands before the existing `2026-03-01 18:00` item in the refetched list (mirror of the existing "same-date" case).

### 9.3 Manual backend checklist (say so in the PR)

With `pnpm dev:api` and an admin token:

- `POST /api/admin/content` with `{ startDate, startTime: '18:00' }` → 201, `data.startTime` stored. With `startTime: '6pm'` → 400 format message. With `startTime` but no `startDate` → 400. With `endDate` ≠ `startDate` → 400.
- `PATCH` setting `endDate` to another day on a timed item → 400; same PATCH with `startTime: null` → 200 and key removed. `PATCH { data: { startDate: null } }` on a timed item → 400; with `startTime: null` too → 200.
- `POST /api/admin/content/:id/duplicate` on a timed item → duplicate has `startTime`.
- Create two cards in one group on the same date (`18:00` then `09:00`) through `POST /api/admin/content` → `orderPosition` places `09:00` first.
- Remote MCP (`/mcp`): `create_card` with a multi-day range + `startTime` → tool error with the §6.2 message; `update_card` with `startTime: null` clears it. Stdio MCP: same via `pnpm --filter @betel/mcp dev`.
- `GET /api/content` returns `startTime` and still lists a timed item after its hour has passed on the same day.

## 10. Work breakdown

| # | Task | Files | Depends on |
|---|------|-------|------------|
| T0 | **Baseline — done.** `fix/timezone-handling` is merged to `main` (PR #17: ADR-017, BR-015, `services/time.ts`, `app/dates.ts`, `content-expiry.ts`, `pnpm test:unit`); start from `main`. | — | — |
| T1 | **Shared helpers.** Create `packages/shared/src/event-time.ts` per §6.5; `export * from './event-time'` in `packages/shared/src/index.ts`; add `packages/shared/tsconfig.json` (extends `../../tsconfig.base.json`, `include: ["src"]`, `noEmit`), `lint` (`tsc --noEmit`) and `test` (`tsx --test 'src/**/*.test.ts'`) scripts plus `tsx`, `typescript`, `@types/node` devDependencies to `packages/shared/package.json`; extend root `test:unit` to `pnpm --filter @betel/shared --filter @betel/api test`; write `event-time.test.ts` (§9.1). Run `pnpm lint` in all packages to confirm app (`bundler`) and api (`NodeNext`) both resolve the new module. | `packages/shared/src/event-time.ts`, `packages/shared/src/index.ts`, `packages/shared/src/event-time.test.ts`, `packages/shared/package.json`, `packages/shared/tsconfig.json`, `package.json`, `pnpm-lock.yaml` | T0 |
| T2 | **API validation + sort.** Call `invalidStartTime` in `POST` and `PATCH` handlers (after `invalidEventDate`, on `data` / `finalData`); switch `sortGroupByStartDate()` to `compareEventSchedules`; `clockTimeSchema` (on `isClockTime`) and `startTime` on `create_card`/`update_card` in the shared contract, `null` deletion in `update_card`'s merge, `invalidStartTime` before insert/update in the remote handlers. Manual checklist §9.3. | `packages/api/src/routes/admin/content.ts`, `packages/api/src/services/group-order.ts`, `packages/api/src/routes/mcp.ts`, `packages/shared/src/mcp-tools.ts` (if 05 T1 has landed; else the schema sits in `routes/mcp.ts` until 05 moves it) | T1 |
| T3 | **Admin form.** `FormData.startTime`, `itemToForm`, `formToPayload`, dates row with the time input, hint, handlers in §6.3, `sortByStartDate` → `compareEventSchedules`. Cypress §9.2 items 1–6 and 12–13. | `packages/app/src/admin/pages/ContentPage.tsx`, `cypress/e2e/event-start-time.cy.ts`, `cypress/e2e/admin-group-chronological-order.cy.ts` | T1 |
| T4 | **Public card.** `CardItem` per §6.4 (both variants), remove `formatDateRange`. Cypress §9.2 items 7–11. | `packages/app/src/public/components/content/CardItem.tsx`, `cypress/e2e/event-start-time.cy.ts` | T1 |
| T5 | **Stdio MCP delta.** `startTime` on `create_card` (`optional`) and `update_card` (`nullable().optional()`, forwarded as `data.startTime: null`) with the §6.2 descriptions; no local regex (plain string until the shared contract supplies `clockTimeSchema`). Coordinate wording with spec 5's owner; this is a two-field change inside their file. Skipped if 05 T1 has already moved the schemas to `mcp-tools.ts` (then T2 covers it). | `packages/mcp/src/index.ts` | — (parallel with T2; same strings) |
| T6 | **Docs** — applied by the coordinator from §12 (requirements, content-model, business-rules, user-flows, ADR index) plus accept ADR-023. | `docs/**` | T2–T5 done |
| T7 | *(optional, chore)* Re-export `CHURCH_TIME_ZONE` from `@betel/shared` in `packages/api/src/services/time.ts` and `packages/app/src/dates.ts` so the zone name has one source. | those two files | T0, T1 |

T2, T3, T4 and T5 can run in parallel once T1 is merged (T1 is small; land it first). Branch: `feat/event-start-time`; commits e.g. `feat(shared): add event-time helpers`, `feat(api): validate and sort by event start time`, `feat(admin): start time input for single-day events`, `feat(public): show event start time on cards`, `feat(mcp): accept startTime on card tools`, `docs: …`.

## 11. Open questions

| # | Question | Recommended default |
|---|----------|---------------------|
| Q1 | Should a timed event disappear from the hub once its start time has passed (e.g. hide at 18:00 + N hours)? | **No — keep date-based expiry (BR-015).** The hub doubles as the day's programme: someone arriving at 18:20 still needs the card; late-day services would vanish mid-event; and hiding by instant would require a server-side clock comparison that differs per visitor and breaks the "visible through the end of the day in Romania" promise just made. If needed later, add an explicit `endTime`/`hideAfter` rather than inferring it from the start. |
| Q2 | When an API/MCP caller makes an event multi-day (or clears the date) without clearing `startTime`, reject (400) or silently drop the time? | **Reject (400)** with the fixed message; the admin form always sends a consistent payload, and MCP agents can act on the message. Silent dropping hides data loss. |
| Q3 | Should posters show the date/time caption? Posters do not show dates at all today. | **No.** Keep posters image-only; the field is stored and used by sort/feeds/JSON-LD. Revisit together with "posters show dates". |
| Q4 | Should the admin content list row show the date and time (e.g. "14 nov · 18:00" after the title)? | **Not in this spec.** The list shows no dates today; adding both is a separate small UX change. |
| Q5 | Separator between date and time on cards: " · " (middle dot) vs ", " vs locale word ("la"/"at" via `UI_KEYS`). | **" · "** — language-neutral, matches the editorial uppercase date line, no translation rows to seed. |
| Q6 | Should `startTime` be allowed on multi-day events in the data model (stored, just not rendered), to avoid the clear-on-range-change behaviour? | **No.** The owner said multi-day events show no times "at least yet"; storing a value no surface renders invites drift. The data model can relax later without migration. |
| Q7 | Time input minute granularity: free (`step="60"`) or 5-minute steps? | **Free minutes** (`step="60"`); the native picker is familiar and `HH:mm` stays canonical. |

## 12. Doc integration

Ready-to-paste snippets for the coordinator (not applied by this spec). `fix/timezone-handling` (BR-015, ADR-017) is merged to `main` (PR #17). BR-035 comes from this spec's reserved BR block.

### `docs/product/requirements.md` — under "### Content Model", after FR-011

```markdown
- FR-075: Every content item's shared date fields support an optional start time `data.startTime` (`HH:mm`, 24-hour, Europe/Bucharest wall clock), valid only when `data.startDate` is set and the event is single-day (no `endDate`, or `endDate == startDate`). `POST`/`PATCH /api/admin/content` and both MCP card tools validate the resulting data and reject violations with HTTP 400 / a tool error. **[Planned — spec 04]** Rules: `docs/domain/content-model.md` — "Event start time"; BR-035.
- FR-076: The admin content form shows an "Ora de început (opțional)" time input in the dates row only while the start date is set and the end date is empty or equal to it; clearing the start date or choosing a different end date hides the input and clears the value, with a hint explaining the single-day rule. **[Planned — spec 04]**
- FR-077: Public cards render a single-day event's time after its date, both localised with `Intl` in the visitor's language and the time always expressed in Romania local time ("14 noiembrie · 18:00", "November 14 · 6:00 PM"), wrapped in `<time dateTime>`; items without a time and multi-day items render as before. No per-language strings are hard-coded. **[Planned — spec 04]**
- FR-078: The start time does not change expiry (an item stays visible through the end of its day in Romania, BR-015); chronological ordering of dated items — group sort (BR-013), the RSS feed and every other consumer — uses the one shared comparator: by date, then untimed before timed, then time; duplication copies the time (BR-009). **[Planned — spec 04]**
- FR-079: `@betel/shared` exports event-time helpers (`isClockTime`, `invalidStartTime`, `isSingleDayEvent`, `eventStartInstant`, `eventStartIso`, `formatEventWhen`, `formatEventTime`, `eventSortKey`, `compareEventSchedules`) used by the API, the app, feeds, structured data and notifications; `create_card`/`update_card` on both MCP surfaces accept `startTime` (`null` clears on update), declared once in the shared MCP tool contract (`packages/shared/src/mcp-tools.ts`) on the shared `isClockTime` helper — no transport carries its own clock regex. **[Planned — spec 04; ADR-023]**
```

Also append `startTime` to FR-048's tool field list when spec 5 updates it, add to FR-046: "ties on the same date are broken by `data.startTime` (untimed first) — BR-013", and make sure FR-060 (spec 02) describes the feed order as "`compareEventSchedules` (date, then untimed first, then time), then display order".

### `docs/domain/content-model.md`

In each content type's field list, after "End date":
```markdown
  - Start time — stored in `data.startTime` (`HH:mm`, Romania local time); single-day events only (see Event start time)
```

New subsection after "### JSONB Date Fields (unified — all types)":
```markdown
### Event start time (`data.startTime`)
Optional on all types. A string `HH:mm` (24-hour, `00:00`–`23:59`) meaning the wall-clock time in `Europe/Bucharest` on `data.startDate`. Allowed only when `startDate` is set and the item is single-day (`endDate` absent or equal to `startDate`); the admin API and both MCP surfaces validate the resulting data and answer 400 otherwise (BR-035). Absent means "all day / time unknown" and every consumer renders date-only. The time is shared across locales and sites, like the dates. It does **not** affect expiry (BR-015 still applies through the end of the day) and is a secondary sort key for chronological group ordering (BR-013). The instant it denotes is derived with `eventStartInstant()` / `eventStartIso()` from `@betel/shared` (`packages/shared/src/event-time.ts`), which also provides the per-locale "when" formatter used by public cards, feeds, structured data and notifications. The admin form shows the time input only while the item is single-day and clears it otherwise.
```

Under "### `data.startDate` as a sort key": replace "(YYYY-MM-DD string comparison)" with "(`eventSortKey()`: `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` when a start time exists, so untimed items on a date sort before timed ones)".

Under "## Duplication → What is copied": add "`startTime` is copied with the other date fields."

### `docs/domain/business-rules.md`

Amend BR-013's first sentence: "Chronological ordering within a group uses `data.startDate` as the primary sort key and `data.startTime` as the secondary key (`eventSortKey()` / `compareEventSchedules()` in `@betel/shared`: ascending; on the same date, items without a time come before timed items). The same comparator orders dated items wherever the product lists them chronologically (feeds included). The sort is stable — …"

Add:
```markdown
- BR-035: An event's start time (`data.startTime`, `HH:mm`, 24-hour) is a wall-clock time in `Europe/Bucharest` on `data.startDate`. It may exist only on single-day items (`startDate` set; `endDate` absent or equal to `startDate`); any write that would leave a time on a multi-day or undated item is rejected (HTTP 400 / MCP tool error), never silently dropped. Absent means all day or unknown, and consumers render the date only. The start time never shortens visibility: expiry remains governed by BR-015. Rationale: [ADR-023](../decisions/ADR-023-event-start-time-wall-clock.md).
```
and in "## Source": `- BR-035 added, BR-013 updated: <date> (event start time, FR-075–FR-079, ADR-023)`.

### `docs/product/user-flows.md` — append

```markdown
### Flow 8 (Admin) — Setting the start time of a single-day event

- Trigger: an admin publishes a card for an event that happens at a specific hour on one day
- Steps:
  - The admin opens the content form and sets "Dată"
  - "Până la" and "Ora de început (opțional)" appear
  - The admin enters the hour (24-hour, Romania time) and saves
  - The public card shows the date followed by the time in the visitor's language ("14 noiembrie · 18:00")
- Success state: the time is stored on the item, shared across languages, and used for chronological ordering inside groups
- Failure or edge states:
  - The admin later sets "Până la" to a different day — the time input disappears, the time is cleared on save and a hint explains that times apply to single-day events only
  - The admin clears "Dată" — end date and time are cleared together
  - The event's hour passes — the card stays visible until the end of the day in Romania (BR-015)
```

### `docs/decisions/README.md` — index row

```markdown
| [ADR-023](ADR-023-event-start-time-wall-clock.md) | Event start time as Bucharest wall-clock `HH:mm`; event-time helpers in `@betel/shared` | Proposed |
```

### `docs/product/roadmap.md` — Phase 2

```markdown
### Event times
Start time for single-day events (spec 04, FR-075–FR-079). Follow-ups not scheduled: end time / duration, times on multi-day events, admin list showing dates and times, calendar (`.ics`) export.
```

### `AGENTS.md` / `docs/architecture/constraints.md`

Code map: add `| Shared runtime helpers (event time) | packages/shared/src/event-time.ts |`. Constraints: note that `packages/shared` now contains runtime code (pure, `Intl`-only) bundled into the API by esbuild and into the app by Vite; keep it dependency-free.

### `docs/product/specs/README.md`

The ADR-017 numbering note is already fixed. Add to "Fixed contracts → Event time": the helper names in §6.5 and the three error strings in §6.2.
