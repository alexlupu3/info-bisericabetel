import { eq, and, ne } from 'drizzle-orm'
import { db } from '../db/client.js'
import { languages, contentTranslations, groupTranslations, uiTranslations } from '../db/schema.js'

const OPEN_ROUTER_BASE = 'https://openrouter.ai/api/v1'
const MODEL = 'anthropic/claude-haiku-4.5'

const SYSTEM_PROMPT = `You are a translation assistant for a Romanian church website called "Biserica Betel".
Your task is to translate content data from Romanian into other languages.

Rules:
1. Translate only natural language text fields (titles, descriptions, addresses written in natural language, etc.)
2. Do NOT translate: URLs, file paths, image URLs, ISO dates, numbers, boolean values, or technical identifiers
3. Preserve the exact JSON structure — only change string values that contain natural language text
4. Fields named "imageUrl", "thumbnail", "url", "link", "href", "src" must be left unchanged
5. Return ONLY valid JSON with no explanation, markdown, or code fences
6. Translations should be accurate and suitable for a Christian church audience`

interface OpenRouterUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

interface OpenRouterResult {
  translations: Record<string, unknown>
  usage: OpenRouterUsage | null
  durationMs: number
}

interface TranslationLogBase {
  service: 'ai-translation'
  model: string
  entityType: 'content' | 'group' | 'ui'
  entityId: string
  mode: 'full' | 'partial'
  targetLocales: string[]
  translatedKeys: string[]
  durationMs: number
}

function logSuccess(base: TranslationLogBase, usage: OpenRouterUsage | null): void {
  console.info(JSON.stringify({
    ...base,
    event: 'translation_complete',
    inputTokens: usage?.prompt_tokens ?? null,
    outputTokens: usage?.completion_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
  }))
}

function logFailure(base: Omit<TranslationLogBase, 'durationMs'>, durationMs: number, error: unknown): void {
  console.error(JSON.stringify({
    ...base,
    event: 'translation_failed',
    durationMs,
    error: error instanceof Error ? error.message : String(error),
  }))
}

async function getTargetLocales(): Promise<Array<{ code: string; name: string }>> {
  const rows = await db.select().from(languages)
    .where(and(eq(languages.enabled, true), ne(languages.isDefault, true)))
  return rows.map(r => ({ code: r.code, name: r.name }))
}

function buildApiKey(): string | null {
  return process.env.OPEN_ROUTER_API_KEY ?? null
}

async function callOpenRouter(
  apiKey: string,
  sourceJson: string,
  targetLocales: Array<{ code: string; name: string }>
): Promise<OpenRouterResult> {
  const localeList = targetLocales.map(l => `- ${l.code}: ${l.name}`).join('\n')
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 45_000)
  const startMs = Date.now()
  let response: Response
  try {
    response = await fetch(`${OPEN_ROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Translate the following JSON content from Romanian to the specified languages.\n\nContent (Romanian):\n${sourceJson}\n\nTarget languages:\n${localeList}\n\nReturn a JSON object with one key per language code, each containing the translated version:\n{"${targetLocales[0].code}": { ...translated fields... }, ...}`,
          },
        ],
        max_tokens: 4096,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(JSON.stringify({ service: 'ai-translation', event: 'translation_timeout', model: MODEL, durationMs: Date.now() - startMs }))
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenRouter API error ${response.status}: ${body}`)
  }

  const durationMs = Date.now() - startMs
  const json = await response.json() as {
    choices: Array<{ message: { content: string } }>
    usage?: OpenRouterUsage
  }
  const raw = json.choices[0]?.message?.content ?? ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  if (!text) throw new Error('OpenRouter returned empty response content')
  let translations: Record<string, unknown>
  try {
    translations = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`OpenRouter response is not valid JSON: ${text.slice(0, 200)}`)
  }
  return {
    translations,
    usage: json.usage ?? null,
    durationMs,
  }
}

export async function scheduleContentTranslation(
  contentItemId: string,
  data: Record<string, unknown>,
  changedKeys?: string[],
): Promise<void> {
  setImmediate(async () => {
    try {
    const apiKey = buildApiKey()
    if (!apiKey) {
      console.warn(JSON.stringify({ service: 'ai-translation', event: 'skipped_no_api_key', entityType: 'content', entityId: contentItemId }))
      return
    }

    const targetLocales = await getTargetLocales()
    if (targetLocales.length === 0) return

    const logBase: Omit<TranslationLogBase, 'durationMs'> = {
      service: 'ai-translation',
      model: MODEL,
      entityType: 'content',
      entityId: contentItemId,
      mode: 'full',
      targetLocales: targetLocales.map(l => l.code),
      translatedKeys: [],
    }

    if (!changedKeys) {
      // Create path: translate full data for all locales
      const startMs = Date.now()
      try {
        const { translations, usage, durationMs } = await callOpenRouter(apiKey, JSON.stringify(data), targetLocales)
        for (const { code } of targetLocales) {
          const translatedData = translations[code]
          if (!translatedData || typeof translatedData !== 'object') continue
          await db.insert(contentTranslations)
            .values({ contentItemId, locale: code, data: translatedData as Record<string, unknown>, updatedAt: new Date() })
            .onConflictDoUpdate({
              target: [contentTranslations.contentItemId, contentTranslations.locale],
              set: { data: translatedData as Record<string, unknown>, updatedAt: new Date() },
            })
        }
        logSuccess({ ...logBase, mode: 'full', translatedKeys: Object.keys(data), durationMs }, usage)
      } catch (err) {
        logFailure({ ...logBase, mode: 'full', translatedKeys: Object.keys(data) }, Date.now() - startMs, err)
      }
    } else {
      // Update path: only translate changed fields, merge into existing translations
      const existingTranslations = await db.select()
        .from(contentTranslations)
        .where(eq(contentTranslations.contentItemId, contentItemId))
      const existingByLocale = new Map(existingTranslations.map(t => [t.locale, t]))

      const localesNeedingFull = targetLocales.filter(l => !existingByLocale.has(l.code))
      const localesNeedingPartial = targetLocales.filter(l => existingByLocale.has(l.code))

      if (localesNeedingPartial.length > 0) {
        const changedData = Object.fromEntries(changedKeys.map(k => [k, data[k]]))
        const startMsPartial = Date.now()
        try {
          const { translations: partialTranslations, usage, durationMs } = await callOpenRouter(apiKey, JSON.stringify(changedData), localesNeedingPartial)
          for (const { code } of localesNeedingPartial) {
            const existing = existingByLocale.get(code)!
            const newFields = partialTranslations[code]
            if (!newFields || typeof newFields !== 'object') continue
            const mergedData = { ...existing.data as Record<string, unknown>, ...newFields as Record<string, unknown> }
            await db.update(contentTranslations)
              .set({ data: mergedData, updatedAt: new Date() })
              .where(and(eq(contentTranslations.contentItemId, contentItemId), eq(contentTranslations.locale, code)))
          }
          logSuccess({ ...logBase, mode: 'partial', targetLocales: localesNeedingPartial.map(l => l.code), translatedKeys: changedKeys, durationMs }, usage)
        } catch (err) {
          logFailure({ ...logBase, mode: 'partial', targetLocales: localesNeedingPartial.map(l => l.code), translatedKeys: changedKeys }, Date.now() - startMsPartial, err)
        }
      }

      if (localesNeedingFull.length > 0) {
        const startMsFull = Date.now()
        try {
          const { translations: fullTranslations, usage, durationMs } = await callOpenRouter(apiKey, JSON.stringify(data), localesNeedingFull)
          for (const { code } of localesNeedingFull) {
            const translatedData = fullTranslations[code]
            if (!translatedData || typeof translatedData !== 'object') continue
            await db.insert(contentTranslations)
              .values({ contentItemId, locale: code, data: translatedData as Record<string, unknown>, updatedAt: new Date() })
              .onConflictDoNothing()
          }
          logSuccess({ ...logBase, mode: 'full', targetLocales: localesNeedingFull.map(l => l.code), translatedKeys: Object.keys(data), durationMs }, usage)
        } catch (err) {
          logFailure({ ...logBase, mode: 'full', targetLocales: localesNeedingFull.map(l => l.code), translatedKeys: Object.keys(data) }, Date.now() - startMsFull, err)
        }
      }
    }
    } catch (err) {
      console.error(JSON.stringify({ service: 'ai-translation', event: 'unhandled_error', entityType: 'content', entityId: contentItemId, error: String(err) }))
    }
  })
}

export async function generateMissingUiTranslations(knownKeys: Record<string, string>): Promise<number> {
  const apiKey = buildApiKey()
  if (!apiKey) throw new Error('OPEN_ROUTER_API_KEY not set — cannot generate translations')

  const targetLocales = await getTargetLocales()
  if (targetLocales.length === 0) return 0

  const existing = await db.select().from(uiTranslations)
  const existingSet = new Set(existing.map(r => `${r.locale}::${r.key}`))

  const missingByLocale: Record<string, Set<string>> = {}
  for (const locale of targetLocales) {
    const missing = Object.keys(knownKeys).filter(k => !existingSet.has(`${locale.code}::${k}`))
    if (missing.length > 0) missingByLocale[locale.code] = new Set(missing)
  }

  const localesWithMissing = targetLocales.filter(l => missingByLocale[l.code])
  if (localesWithMissing.length === 0) return 0

  const allMissingKeys = new Set<string>()
  for (const keys of Object.values(missingByLocale)) keys.forEach(k => allMissingKeys.add(k))

  const sourceData = Object.fromEntries([...allMissingKeys].map(k => [k, knownKeys[k]]))
  const translatedKeys = [...allMissingKeys]

  const logBase: Omit<TranslationLogBase, 'durationMs'> = {
    service: 'ai-translation',
    model: MODEL,
    entityType: 'ui',
    entityId: 'ui-translations',
    mode: 'full',
    targetLocales: localesWithMissing.map(l => l.code),
    translatedKeys,
  }

  const { translations, usage, durationMs } = await callOpenRouter(apiKey, JSON.stringify(sourceData), localesWithMissing)

  let count = 0
  for (const locale of localesWithMissing) {
    const localeTranslations = translations[locale.code]
    if (!localeTranslations || typeof localeTranslations !== 'object') continue

    for (const key of missingByLocale[locale.code]) {
      const value = (localeTranslations as Record<string, unknown>)[key]
      if (typeof value !== 'string') continue
      const inserted = await db.insert(uiTranslations)
        .values({ locale: locale.code, key, value, updatedAt: new Date() })
        .onConflictDoNothing()
        .returning()
      if (inserted.length > 0) count++
    }
  }

  logSuccess({ ...logBase, durationMs }, usage)
  return count
}

export async function scheduleGroupTranslation(groupId: string, title: string): Promise<void> {
  setImmediate(async () => {
    try {
    const apiKey = buildApiKey()
    if (!apiKey) {
      console.warn(JSON.stringify({ service: 'ai-translation', event: 'skipped_no_api_key', entityType: 'group', entityId: groupId }))
      return
    }

    const targetLocales = await getTargetLocales()
    if (targetLocales.length === 0) return

    const logBase: Omit<TranslationLogBase, 'durationMs'> = {
      service: 'ai-translation',
      model: MODEL,
      entityType: 'group',
      entityId: groupId,
      mode: 'full',
      targetLocales: targetLocales.map(l => l.code),
      translatedKeys: ['title'],
    }

    const startMs = Date.now()
    try {
      const { translations, usage, durationMs } = await callOpenRouter(apiKey, JSON.stringify({ title }), targetLocales)

      for (const { code } of targetLocales) {
        const translatedData = translations[code]
        if (!translatedData || typeof translatedData !== 'object') continue
        const translatedTitle = (translatedData as Record<string, unknown>).title
        if (typeof translatedTitle !== 'string') continue
        await db.insert(groupTranslations)
          .values({ groupId, locale: code, title: translatedTitle, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: [groupTranslations.groupId, groupTranslations.locale],
            set: { title: translatedTitle, updatedAt: new Date() },
          })
      }
      logSuccess({ ...logBase, durationMs }, usage)
    } catch (err) {
      logFailure(logBase, Date.now() - startMs, err)
    }
    } catch (err) {
      console.error(JSON.stringify({ service: 'ai-translation', event: 'unhandled_error', entityType: 'group', entityId: groupId, error: String(err) }))
    }
  })
}
