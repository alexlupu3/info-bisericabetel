import type { FastifyInstance } from 'fastify'
import { and, asc, eq, isNull, or, gt, sql, getTableColumns } from 'drizzle-orm'
import { db } from '../db/client.js'
import { contentItems, groups } from '../db/schema.js'

export async function contentRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { site?: string } }>('/content', async req => {
    const { site } = req.query

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

    const rows = await db
      .select({
        ...getTableColumns(contentItems),
        groupTitle: groups.title,
      })
      .from(contentItems)
      .leftJoin(groups, eq(contentItems.groupId, groups.id))
      .where(
        and(
          eq(contentItems.state, 'published'),
          or(isNull(contentItems.expiresAt), gt(contentItems.expiresAt, now)),
          dateFilter,
          siteFilter
        )
      )
      .orderBy(
        // Root position: use group's orderPosition for grouped items, item's for standalone
        asc(sql`COALESCE(${groups.orderPosition}, ${contentItems.orderPosition})`),
        // Within-group tiebreaker
        asc(contentItems.orderPosition)
      )

    return {
      site: site ?? null,
      items: rows,
    }
  })
}
