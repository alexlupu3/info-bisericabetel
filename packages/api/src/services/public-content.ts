// Server-side "visible items" query of the public hub, shared by GET /api/content,
// the server-rendered pages and sitemap (spec 03) and the RSS feed (spec 02).
// Extracted unchanged in behaviour from routes/content.ts (spec 02 §6.3).

import { and, asc, eq, isNull, or, gt, sql, getTableColumns, type SQL } from 'drizzle-orm'
import { db } from '../db/client.js'
import { contentItems, groups, contentTranslations, groupTranslations } from '../db/schema.js'
import { CHURCH_TIME_ZONE } from './time.js'

import { DEFAULT_LOCALE } from './locale.js'

export { DEFAULT_LOCALE }

export interface PublicContentOptions { site: string | null; locale: string }

/** A row of content_items plus `groupTitle`, with `data` merged with the locale's translation. */
export type PublicContentItem = typeof contentItems.$inferSelect & {
  groupTitle: string | null
  data: Record<string, unknown>
}

// Site-exclusive items belong to exactly one site and are hidden from the all-sites view.
// When a site is selected: include items exclusive to that site OR non-exclusive items
// whose surfacing hint matches (sites[] empty or contains the site).
// When no site is selected (all-sites view): hide every exclusive item.
function siteFilter(site: string | null): SQL | undefined {
  return site
    ? or(
        eq(contentItems.exclusiveSite, site),
        and(
          isNull(contentItems.exclusiveSite),
          or(
            sql`${contentItems.sites} = '{}'`,
            sql`${site} = ANY(${contentItems.sites})`
          )
        )
      )
    : isNull(contentItems.exclusiveSite)
}

// Published and not expired. For all content types: filter out past items based on endDate
// or startDate in JSONB data. endDate is authoritative if present; fallback to startDate; no
// date = permanent (always shown). Event dates are calendar days in the church's timezone
// (Europe/Bucharest): an item stays visible until the end of its last day in Romania,
// regardless of the server's own timezone. Compare the YYYY-MM-DD prefix as text rather than
// casting to ::date, so one malformed legacy value cannot make the whole query fail.
function visibilityFilter(): SQL | undefined {
  const now = new Date()
  const todayLocal = sql`to_char(NOW() AT TIME ZONE ${CHURCH_TIME_ZONE}, 'YYYY-MM-DD')`
  const dateFilter = sql`(
    CASE
      WHEN ${contentItems.data}->>'endDate' IS NOT NULL
        THEN left(${contentItems.data}->>'endDate', 10) >= ${todayLocal}
      WHEN ${contentItems.data}->>'startDate' IS NOT NULL
        THEN left(${contentItems.data}->>'startDate', 10) >= ${todayLocal}
      ELSE TRUE
    END
  )`
  return and(
    eq(contentItems.state, 'published'),
    or(isNull(contentItems.expiresAt), gt(contentItems.expiresAt, now)),
    dateFilter,
  )
}

async function queryVisible(where: SQL | undefined, locale: string): Promise<PublicContentItem[]> {
  const needsTranslation = locale && locale !== DEFAULT_LOCALE

  // LEFT JOIN groups so we can sort grouped items by their group's root orderPosition,
  // then by their own within-group orderPosition.
  const orderByClause = [
    // Root position: use group's orderPosition for grouped items, item's for standalone
    asc(sql`COALESCE(${groups.orderPosition}, ${contentItems.orderPosition})`),
    // Within-group tiebreaker
    asc(contentItems.orderPosition),
  ] as const

  if (needsTranslation) {
    const rawRows = await db
      .select({
        ...getTableColumns(contentItems),
        groupTitle: groups.title,
        translatedData: contentTranslations.data,
        translatedGroupTitle: groupTranslations.title,
      })
      .from(contentItems)
      .leftJoin(groups, eq(contentItems.groupId, groups.id))
      .leftJoin(contentTranslations, and(
        eq(contentTranslations.contentItemId, contentItems.id),
        eq(contentTranslations.locale, locale)
      ))
      .leftJoin(groupTranslations, and(
        eq(groupTranslations.groupId, groups.id),
        eq(groupTranslations.locale, locale)
      ))
      .where(where)
      .orderBy(...orderByClause)

    // Merge translated text fields into data
    return rawRows.map(row => {
      const translatedData = row.translatedData as Record<string, unknown> | null
      const data = row.data as Record<string, unknown>
      return {
        ...row,
        data: translatedData ? { ...data, ...translatedData } : data,
        groupTitle: row.translatedGroupTitle ?? row.groupTitle,
        translatedData: undefined,
        translatedGroupTitle: undefined,
      }
    })
  }

  const rows = await db
    .select({
      ...getTableColumns(contentItems),
      groupTitle: groups.title,
    })
    .from(contentItems)
    .leftJoin(groups, eq(contentItems.groupId, groups.id))
    .where(where)
    .orderBy(...orderByClause)
  return rows as PublicContentItem[]
}

/** The items the public hub shows for a scope (`site = null` → all-sites view), in display order. */
export async function listPublicContent(opts: PublicContentOptions): Promise<PublicContentItem[]> {
  return queryVisible(and(visibilityFilter(), siteFilter(opts.site)), opts.locale)
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export type PublicItemLookup =
  | { status: 'visible'; item: PublicContentItem }
  | { status: 'gone' }       // soft-deleted
  | { status: 'not-found' }  // unknown id, draft, archived or expired

/**
 * One item if it is visible on the public hub in some view (published, not expired —
 * the same rule as listPublicContent, without the site scope). Drafts never leak.
 */
export async function findPublicItem(id: string, locale: string): Promise<PublicItemLookup> {
  if (!isUuid(id)) return { status: 'not-found' }
  const [item] = await queryVisible(and(visibilityFilter(), eq(contentItems.id, id)), locale)
  if (item) return { status: 'visible', item }
  const [row] = await db.select({ state: contentItems.state }).from(contentItems).where(eq(contentItems.id, id))
  return row?.state === 'deleted' ? { status: 'gone' } : { status: 'not-found' }
}

// Pure, DB-free implementation lives in upcoming-events.ts so renderers and tests can use it
// without a database connection.
export { selectUpcomingEvents } from './upcoming-events.js'
