import { eq, and, ne } from 'drizzle-orm'
import { db } from '../db/client.js'
import { languages, contentTranslations, groupTranslations, uiTranslations } from '../db/schema.js'

const OPEN_ROUTER_BASE = 'https://openrouter.ai/api/v1'
const MODEL = 'anthropic/claude-haiku-4-5'

const SYSTEM_PROMPT = `You are a translation assistant for a Romanian church website called "Biserica Betel".
Your task is to translate content data from Romanian into other languages.

Rules:
1. Translate only natural language text fields (titles, descriptions, addresses written in natural language, etc.)
2. Do NOT translate: URLs, file paths, image URLs, ISO dates, numbers, boolean values, or technical identifiers
3. Preserve the exact JSON structure — only change string values that contain natural language text
4. Fields named "imageUrl", "thumbnail", "url", "link", "href", "src" must be left unchanged
5. Return ONLY valid JSON with no explanation, markdown, or code fences
6. Translations should be accurate and suitable for a Christian church audience`

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
): Promise<Record<string, unknown>> {
  const localeList = targetLocales.map(l => `- ${l.code}: ${l.name}`).join('\n')
  const response = await fetch(`${OPEN_ROUTER_BASE}/chat/completions`, {
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
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenRouter API error ${response.status}: ${body}`)
  }

  const json = await response.json() as { choices: Array<{ message: { content: string } }> }
  const raw = json.choices[0]?.message?.content ?? ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  return JSON.parse(text)
}

export async function scheduleContentTranslation(contentItemId: string, data: Record<string, unknown>): Promise<void> {
  setImmediate(async () => {
    try {
      const apiKey = buildApiKey()
      if (!apiKey) {
        console.warn('[ai-translation] OPEN_ROUTER_API_KEY not set — skipping auto-translation')
        return
      }
      const targetLocales = await getTargetLocales()
      if (targetLocales.length === 0) return

      const translations = await callOpenRouter(apiKey, JSON.stringify(data), targetLocales)

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
      console.info(`[ai-translation] Translated content ${contentItemId} into ${targetLocales.map(l => l.code).join(', ')}`)
    } catch (err) {
      console.error('[ai-translation] Failed to auto-translate content', contentItemId, err)
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
  const translations = await callOpenRouter(apiKey, JSON.stringify(sourceData), localesWithMissing)

  let count = 0
  for (const locale of localesWithMissing) {
    const localeTranslations = translations[locale.code]
    if (!localeTranslations || typeof localeTranslations !== 'object') continue

    for (const key of missingByLocale[locale.code]) {
      const value = (localeTranslations as Record<string, unknown>)[key]
      if (typeof value !== 'string') continue
      await db.insert(uiTranslations)
        .values({ locale: locale.code, key, value, updatedAt: new Date() })
        .onConflictDoNothing()
      count++
    }
  }

  console.info(`[ai-translation] Generated ${count} missing UI translations`)
  return count
}

export async function scheduleGroupTranslation(groupId: string, title: string): Promise<void> {
  setImmediate(async () => {
    try {
      const apiKey = buildApiKey()
      if (!apiKey) {
        console.warn('[ai-translation] OPEN_ROUTER_API_KEY not set — skipping auto-translation')
        return
      }
      const targetLocales = await getTargetLocales()
      if (targetLocales.length === 0) return

      const translations = await callOpenRouter(apiKey, JSON.stringify({ title }), targetLocales)

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
      console.info(`[ai-translation] Translated group ${groupId} into ${targetLocales.map(l => l.code).join(', ')}`)
    } catch (err) {
      console.error('[ai-translation] Failed to auto-translate group', groupId, err)
    }
  })
}
