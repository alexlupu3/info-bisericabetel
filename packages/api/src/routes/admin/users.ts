import { randomBytes } from 'crypto'
import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { logAudit } from '../../db/audit.js'

function superAdminOnly(req: any, reply: any, done: any) {
  if ((req.user as any)?.role !== 'super-admin') {
    reply.code(403).send({ error: 'Forbidden' })
    return
  }
  done()
}

export async function adminUsersRoutes(app: FastifyInstance) {
  const auth = [app.authenticate, superAdminOnly]

  app.get('/admin/users', { preHandler: auth }, async () => {
    const rows = await db.select({
      id: users.id, email: users.email, role: users.role,
      mustChangePassword: users.mustChangePassword, createdAt: users.createdAt,
    }).from(users)
    return { users: rows }
  })

  app.post<{ Body: { email: string; role?: string } }>(
    '/admin/users', { preHandler: auth }, async (req, reply) => {
      const { email, role = 'admin' } = req.body
      if (!email) return reply.code(400).send({ error: 'email is required' })

      // Temporary password — user must change on first login
      const tempPassword = randomBytes(8).toString('hex')
      const hash = await bcrypt.hash(tempPassword, 12)

      const [user] = await db.insert(users).values({
        email, passwordHash: hash, role, mustChangePassword: true,
      }).returning({ id: users.id, email: users.email, role: users.role })

      return reply.code(201).send({ ...user, tempPassword })
    }
  )

  app.post<{ Params: { id: string } }>(
    '/admin/users/:id/reset-password', { preHandler: auth }, async (req, reply) => {
      const { id } = req.params
      const actor = req.user as any

      const [target] = await db.select({
        id: users.id, email: users.email, role: users.role,
      }).from(users).where(eq(users.id, id))

      if (!target) return reply.code(404).send({ error: 'User not found' })
      if (target.role !== 'admin') return reply.code(400).send({ error: 'Can only reset password for admin users' })

      const tempPassword = randomBytes(8).toString('hex')
      const hash = await bcrypt.hash(tempPassword, 12)

      await db.update(users)
        .set({ passwordHash: hash, mustChangePassword: true, updatedAt: new Date() })
        .where(eq(users.id, id))

      await logAudit({
        userId: actor.sub,
        userEmail: actor.email,
        action: 'reset_password',
        entityType: 'user',
        entityId: id,
        detail: { targetEmail: target.email },
      })

      return { tempPassword }
    }
  )

  app.delete<{ Params: { id: string } }>(
    '/admin/users/:id', { preHandler: auth }, async (req, reply) => {
      await db.delete(users).where(eq(users.id, req.params.id))
      return reply.code(204).send()
    }
  )
}
