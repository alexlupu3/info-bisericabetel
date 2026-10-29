import { compareEventSchedules, type EventSchedule } from '@betel/shared'

/**
 * "Current and upcoming events" (spec 02 §1): the visible items that have a startDate,
 * chronological (spec 04's compareEventSchedules; stable, so ties keep display order).
 * Re-exported by services/public-content.ts, which owns the contract.
 */
export function selectUpcomingEvents<T extends { data: Record<string, unknown> }>(items: T[], limit = 100): T[] {
  return items
    .filter(it => typeof it.data.startDate === 'string' && it.data.startDate.trim() !== '')
    .sort((a, b) => compareEventSchedules(a.data as EventSchedule, b.data as EventSchedule))
    .slice(0, limit)
}
