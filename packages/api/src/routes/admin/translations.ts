import type { FastifyInstance } from 'fastify'
import { eq, asc, inArray } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { uiTranslations, languages } from '../../db/schema.js'
import { logAudit } from '../../db/audit.js'
import { generateMissingUiTranslations } from '../../services/ai-translation.js'

function adminOnly(req: any, reply: any, done: any) {
  const role = (req.user as any)?.role
  if (role !== 'admin' && role !== 'super-admin') {
    reply.code(403).send({ error: 'Forbidden' })
    return
  }
  done()
}

function superAdminOnly(req: any, reply: any, done: any) {
  if ((req.user as any)?.role !== 'super-admin') {
    reply.code(403).send({ error: 'Forbidden' })
    return
  }
  done()
}

export async function adminTranslationsRoutes(app: FastifyInstance) {
  // Public route — returns flat key-value map for a single locale
  app.get<{ Querystring: { locale?: string } }>('/translations', async (req, reply) => {
    const { locale } = req.query
    if (!locale) return reply.code(400).send({ error: 'locale query parameter is required' })

    const rows = await db.select()
      .from(uiTranslations)
      .where(eq(uiTranslations.locale, locale))
      .orderBy(asc(uiTranslations.key))

    const translations: Record<string, string> = {}
    for (const row of rows) {
      translations[row.key] = row.value
    }

    return { locale, translations }
  })

  // Admin routes
  const auth = [app.authenticate, adminOnly]
  const superAuth = [app.authenticate, superAdminOnly]

  // List all translation keys with values grouped by key across locales
  app.get('/admin/translations', { preHandler: auth }, async () => {
    const rows = await db.select()
      .from(uiTranslations)
      .orderBy(asc(uiTranslations.key), asc(uiTranslations.locale))

    const keyMap = new Map<string, Record<string, string>>()
    for (const row of rows) {
      let values = keyMap.get(row.key)
      if (!values) {
        values = {}
        keyMap.set(row.key, values)
      }
      values[row.locale] = row.value
    }

    const keys = Array.from(keyMap.entries()).map(([key, values]) => ({ key, values }))
    return { keys }
  })

  // Bulk upsert translations
  app.put<{ Body: { translations: Array<{ locale: string; key: string; value: string }> } }>(
    '/admin/translations', { preHandler: superAuth }, async (req, reply) => {
      const { translations } = req.body
      if (!Array.isArray(translations)) {
        return reply.code(400).send({ error: 'translations must be an array' })
      }

      for (const entry of translations) {
        if (typeof entry.locale !== 'string' || entry.locale.trim() === '') {
          return reply.code(400).send({ error: 'Each translation entry must have a non-empty locale' })
        }
        if (typeof entry.key !== 'string' || entry.key.trim() === '') {
          return reply.code(400).send({ error: 'Each translation entry must have a non-empty key' })
        }
        if (typeof entry.value !== 'string' || entry.value.trim() === '') {
          return reply.code(400).send({ error: 'Each translation entry must have a non-empty value' })
        }
      }

      const uniqueLocales = [...new Set(translations.map(t => t.locale))]
      const existingLangs = await db.select({ code: languages.code })
        .from(languages)
        .where(inArray(languages.code, uniqueLocales))
      const existingCodes = new Set(existingLangs.map(l => l.code))
      const invalidLocales = uniqueLocales.filter(l => !existingCodes.has(l))
      if (invalidLocales.length > 0) {
        return reply.code(400).send({ error: `Unknown locale(s): ${invalidLocales.join(', ')}` })
      }

      await db.transaction(async tx => {
        for (const { locale, key, value } of translations) {
          await tx.insert(uiTranslations)
            .values({ locale, key, value, updatedAt: new Date() })
            .onConflictDoUpdate({
              target: [uiTranslations.locale, uiTranslations.key],
              set: { value, updatedAt: new Date() },
            })
        }
      })

      const actor = req.user as any
      await logAudit({
        userId: actor.sub,
        userEmail: actor.email ?? '',
        action: 'translation.bulk-upsert',
        entityType: 'translation',
        detail: { count: translations.length },
      })

      return { ok: true }
    }
  )

  // Generate missing UI translations via AI
  app.post<{ Body: { keys: Record<string, string> } }>(
    '/admin/translations/generate', { preHandler: superAuth }, async (req, reply) => {
      const { keys } = req.body
      if (!keys || typeof keys !== 'object') {
        return reply.code(400).send({ error: 'keys must be an object' })
      }
      try {
        const generated = await generateMissingUiTranslations(keys)
        const actor = req.user as any
        if (generated > 0) {
          await logAudit({
            userId: actor.sub,
            userEmail: actor.email ?? '',
            action: 'translation.ai-generate',
            entityType: 'translation',
            detail: { generated },
          })
        }
        return { generated }
      } catch (err: any) {
        return reply.code(500).send({ error: err.message ?? 'Generation failed' })
      }
    }
  )
}
