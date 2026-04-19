import type { FastifyInstance } from 'fastify'
import { and, asc, eq, isNull, or, gt, sql, getTableColumns } from 'drizzle-orm'
import { db } from '../db/client.js'
import { contentItems, groups, contentTranslations, groupTranslations } from '../db/schema.js'

export async function contentRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { site?: string; locale?: string } }>('/content', async req => {
    const { site, locale } = req.query
    const needsTranslation = locale && locale !== 'ro'

    const now = new Date()

    const siteFilter = site
      ? or(
          sql`${contentItems.sites} = '{}'`,
          sql`${site} = ANY(${contentItems.sites})`
        )
      : undefined

    // LEFT JOIN groups so we can sort grouped items by their group's root orderPosition,
    // then by their own within-group orderPosition.
    // For all content types: filter out past items based on endDate or startDate in JSONB data.
    // endDate is authoritative if present; fallback to startDate; no date = permanent (always shown).
    const dateFilter = sql`(
      CASE
        WHEN ${contentItems.data}->>'endDate' IS NOT NULL
          THEN (${contentItems.data}->>'endDate')::date >= CURRENT_DATE
        WHEN ${contentItems.data}->>'startDate' IS NOT NULL
          THEN (${contentItems.data}->>'startDate')::date >= CURRENT_DATE
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
