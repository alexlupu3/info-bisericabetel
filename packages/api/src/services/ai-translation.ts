import Anthropic from '@anthropic-ai/sdk'
import { eq, and, ne } from 'drizzle-orm'
import { db } from '../db/client.js'
import { languages, contentTranslations, groupTranslations } from '../db/schema.js'

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

function buildClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  return new Anthropic({ apiKey: key })
}

async function callClaude(
  client: Anthropic,
  sourceJson: string,
  targetLocales: Array<{ code: string; name: string }>
): Promise<Record<string, unknown>> {
  const localeList = targetLocales.map(l => `- ${l.code}: ${l.name}`).join('\n')
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `Translate the following JSON content from Romanian to the specified languages.\n\nContent (Romanian):\n${sourceJson}\n\nTarget languages:\n${localeList}\n\nReturn a JSON object with one key per language code, each containing the translated version:\n{"${targetLocales[0].code}": { ...translated fields... }, ...}`
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return JSON.parse(text)
}

export async function scheduleContentTranslation(contentItemId: string, data: Record<string, unknown>): Promise<void> {
  setImmediate(async () => {
    try {
      const client = buildClient()
      if (!client) {
        console.warn('[ai-translation] ANTHROPIC_API_KEY not set — skipping auto-translation')
        return
      }
      const targetLocales = await getTargetLocales()
      if (targetLocales.length === 0) return

      const translations = await callClaude(client, JSON.stringify(data), targetLocales)

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

export async function scheduleGroupTranslation(groupId: string, title: string): Promise<void> {
  setImmediate(async () => {
    try {
      const client = buildClient()
      if (!client) {
        console.warn('[ai-translation] ANTHROPIC_API_KEY not set — skipping auto-translation')
        return
      }
      const targetLocales = await getTargetLocales()
      if (targetLocales.length === 0) return

      const translations = await callClaude(client, JSON.stringify({ title }), targetLocales)

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
