import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'

interface LoginBody { email: string; password: string }

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: LoginBody }>('/auth/login', async (req, reply) => {
    const { email, password } = req.body

    if (!email || !password) {
      return reply.code(400).send({ error: 'email and password are required' })
    }

    const [user] = await db.select().from(users).where(eq(users.email, email))
    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const token = app.jwt.sign(
      { sub: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword },
      { expiresIn: '8h' }
    )

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    }
  })

  app.post<{ Body: { currentPassword: string; newPassword: string } }>(
    '/auth/change-password',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { currentPassword, newPassword } = req.body
      const userId = (req.user as { sub: string }).sub

      if (!newPassword || newPassword.length < 8) {
        return reply.code(400).send({ error: 'New password must be at least 8 characters' })
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId))
      if (!user) return reply.code(404).send({ error: 'User not found' })

      const valid = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!valid) return reply.code(401).send({ error: 'Current password is incorrect' })

      const hash = await bcrypt.hash(newPassword, 12)
      await db.update(users)
        .set({ passwordHash: hash, mustChangePassword: false, updatedAt: new Date() })
        .where(eq(users.id, userId))

      return { ok: true }
    }
  )

  app.get('/auth/me', { preHandler: [app.authenticate] }, async req => {
    const userId = (req.user as { sub: string }).sub
    const [user] = await db.select({
      id: users.id, email: users.email, role: users.role,
      mustChangePassword: users.mustChangePassword,
    }).from(users).where(eq(users.id, userId))
    return user
  })
}
