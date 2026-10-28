import type { FastifyInstance } from 'fastify'
import { and, asc, eq, isNull, or, gt, sql, getTableColumns } from 'drizzle-orm'
import { db } from '../db/client.js'
import { contentItems, groups, contentTranslations, groupTranslations } from '../db/schema.js'
import { CHURCH_TIME_ZONE } from '../services/time.js'

export async function contentRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { site?: string; locale?: string } }>('/content', async req => {
    const { site, locale } = req.query
    const needsTranslation = locale && locale !== 'ro'

    const now = new Date()

    // Site-exclusive items belong to exactly one site and are hidden from the all-sites view.
    // When a site is selected: include items exclusive to that site OR non-exclusive items
    // whose surfacing hint matches (sites[] empty or contains the site).
    // When no site is selected (all-sites view): hide every exclusive item.
    const siteFilter = site
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

    // LEFT JOIN groups so we can sort grouped items by their group's root orderPosition,
    // then by their own within-group orderPosition.
    // For all content types: filter out past items based on endDate or startDate in JSONB data.
    // endDate is authoritative if present; fallback to startDate; no date = permanent (always shown).
    // Event dates are calendar days in the church's timezone (Europe/Bucharest): an item stays
    // visible until the end of its last day in Romania, regardless of the server's own timezone.
    // Compare the YYYY-MM-DD prefix as text rather than casting to ::date, so one malformed
    // legacy value cannot make the whole query fail.
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

    const whereClause = and(
      eq(contentItems.state, 'published'),
      or(isNull(contentItems.expiresAt), gt(contentItems.expiresAt, now)),
      dateFilter,
      siteFilter
    )

    const orderByClause = [
      // Root position: use group's orderPosition for grouped items, item's for standalone
      asc(sql`COALESCE(${groups.orderPosition}, ${contentItems.orderPosition})`),
      // Within-group tiebreaker
      asc(contentItems.orderPosition),
    ] as const

    let rows
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
        .where(whereClause)
        .orderBy(...orderByClause)

      // Merge translated text fields into data
      rows = rawRows.map(row => {
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
    } else {
      rows = await db
        .select({
          ...getTableColumns(contentItems),
          groupTitle: groups.title,
        })
        .from(contentItems)
        .leftJoin(groups, eq(contentItems.groupId, groups.id))
        .where(whereClause)
        .orderBy(...orderByClause)
    }

    return {
      site: site ?? null,
      items: rows,
    }
  })
}
