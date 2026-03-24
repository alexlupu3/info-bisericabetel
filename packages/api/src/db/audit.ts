import { db } from './client.js'
import { auditLog } from './schema.js'

export async function logAudit(params: {
  userId?: string
  userEmail?: string
  action: string
  entityType?: string
  entityId?: string
  detail?: Record<string, unknown>
}) {
  try {
    await db.insert(auditLog).values({
      userId:     params.userId ?? null,
      userEmail:  params.userEmail ?? '',
      action:     params.action,
      entityType: params.entityType ?? 'content',
      entityId:   params.entityId ?? null,
      detail:     params.detail ?? {},
    })
  } catch {
    // Audit failures must never break the main request
  }
}
