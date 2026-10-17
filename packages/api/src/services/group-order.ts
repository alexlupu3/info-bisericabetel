import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { contentItems } from '../db/schema.js'

// Stable sort by data.startDate (YYYY-MM-DD, ascending); undated items go last (BR-013).
export function sortGroupByStartDate<T extends { id: string; data: unknown }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const da = ((a.data as Record<string, unknown>)?.startDate as string | undefined) ?? null
    const db = ((b.data as Record<string, unknown>)?.startDate as string | undefined) ?? null
    if (!da && !db) return 0
    if (!da) return 1
    if (!db) return -1
    return da < db ? -1 : da > db ? 1 : 0
  })
}

// Re-sort a group chronologically after an item was created in it and persist the
// positions 0..n-1. Siblings are loaded in display order (orderPosition) so ties keep
// their prior relative order; a just-created item holds MAX+1 and so stays last among ties.
// Returns the new position of `itemId`, or null if it is not in the group.
export async function resortGroupChronologically(groupId: string, itemId: string): Promise<number | null> {
  // Take the same advisory lock as content inserts (1001) and read + rewrite the group in one
  // transaction, so concurrent creates cannot interleave and overwrite each other's ordering.
  const sorted = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1001)`)
    const groupItems = await tx.select()
      .from(contentItems)
      .where(and(eq(contentItems.groupId, groupId), ne(contentItems.state, 'deleted')))
      .orderBy(asc(contentItems.orderPosition))

    const result = sortGroupByStartDate(groupItems)
    for (let i = 0; i < result.length; i++) {
      await tx.update(contentItems)
        .set({ orderPosition: i })
        .where(eq(contentItems.id, result[i].id))
    }
    return result
  })
  const idx = sorted.findIndex(s => s.id === itemId)
  return idx === -1 ? null : idx
}
