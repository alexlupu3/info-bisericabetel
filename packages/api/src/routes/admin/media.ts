import type { FastifyInstance } from 'fastify'
import { createWriteStream, mkdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { db } from '../../db/client.js'
import { media, contentItems } from '../../db/schema.js'
import { eq, sql } from 'drizzle-orm'

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? join(process.cwd(), '..', 'uploads')
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024 // 5 MB — matches Nginx client_max_body_size
const MAX_WIDTH = 1980

function adminOnly(req: any, reply: any, done: any) {
  const role = (req.user as any)?.role
  if (role !== 'admin' && role !== 'super-admin') {
    reply.code(403).send({ error: 'Forbidden' })
    return
  }
  done()
}

export async function adminMediaRoutes(app: FastifyInstance) {
  const auth = [app.authenticate, adminOnly]

  // Upload a new image
  app.post('/admin/media', { preHandler: auth, bodyLimit: MAX_UPLOAD_SIZE }, async (req, reply) => {
    const data = await (req as any).file({ limits: { fileSize: MAX_UPLOAD_SIZE } })
    if (!data) return reply.code(400).send({ error: 'No file uploaded' })

    // Accept any image type (sharp handles the decoding)
    if (!data.mimetype?.startsWith('image/')) {
      return reply.code(400).send({ error: 'Unsupported file type. Only images are allowed.' })
    }

    // Read file into buffer for sharp processing
    const chunks: Buffer[] = []
    for await (const chunk of data.file) {
      chunks.push(chunk as Buffer)
    }
    const inputBuffer = Buffer.concat(chunks)

    mkdirSync(UPLOADS_DIR, { recursive: true })
    const filename = `${randomUUID()}.webp`
    const dest = join(UPLOADS_DIR, filename)

    // Resize to max MAX_WIDTH wide (preserve aspect ratio, never enlarge),
    // auto-rotate based on EXIF, output as WebP at high quality.
    await sharp(inputBuffer)
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(dest)

    const { size } = statSync(dest)
    const url = `/uploads/${filename}`
    const [row] = await db.insert(media).values({
      url,
      filename,
      originalName: data.filename,
      size,
      mimeType: 'image/webp',
    }).returning()

    return { url: row.url, id: row.id }
  })

  // List all media with usage info
  app.get('/admin/media', { preHandler: auth }, async (_req, _reply) => {
    const rows = await db.select().from(media).orderBy(sql`${media.createdAt} DESC`)

    // For each image, find content items that reference it
    const usages = await Promise.all(
      rows.map(async (m) => {
        const users = await db
          .select({ id: contentItems.id, type: contentItems.type, data: contentItems.data })
          .from(contentItems)
          .where(
            sql`${contentItems.data}->>'imageUrl' = ${m.url}
             OR ${contentItems.data}->>'thumbnail' = ${m.url}`
          )
        return {
          ...m,
          usedBy: users.map(u => {
            const d = u.data as Record<string, string>
            return {
              id: u.id,
              type: u.type,
              name: d.name ?? d.title ?? u.id,
            }
          }),
        }
      })
    )

    return { media: usages }
  })

  // Delete a media item (only if not in use)
  app.delete('/admin/media/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = req.params as { id: string }

    const [row] = await db.select().from(media).where(eq(media.id, id))
    if (!row) return reply.code(404).send({ error: 'Not found' })

    // Check if in use
    const [inUse] = await db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(
        sql`${contentItems.data}->>'imageUrl' = ${row.url}
         OR ${contentItems.data}->>'thumbnail' = ${row.url}`
      )
      .limit(1)

    if (inUse) {
      return reply.code(409).send({ error: 'Image is in use and cannot be deleted' })
    }

    // Delete file from disk
    try {
      unlinkSync(join(UPLOADS_DIR, row.filename))
    } catch {
      // File may already be missing — continue with DB cleanup
    }

    await db.delete(media).where(eq(media.id, id))
    return reply.code(204).send()
  })
}
