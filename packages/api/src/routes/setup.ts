import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'

export async function setupRoutes(app: FastifyInstance) {
  // One-time bootstrap: creates the first super-admin only if no users exist.
  // Returns 409 once any user exists, so it is safe to leave deployed.
  app.post<{ Body: { email: string; password: string } }>('/setup', async (req, reply) => {
    const { email, password } = req.body

    if (!email || !password) {
      return reply.code(400).send({ error: 'email and password are required' })
    }
    if (password.length < 8) {
      return reply.code(400).send({ error: 'password must be at least 8 characters' })
    }

    const existing = await db.select({ id: users.id }).from(users).limit(1)
    if (existing.length > 0) {
      return reply.code(409).send({ error: 'Setup already complete' })
    }

    const hash = await bcrypt.hash(password, 12)
    const [user] = await db.insert(users).values({
      email,
      passwordHash: hash,
      role: 'super-admin',
      mustChangePassword: false,
    }).returning({ id: users.id, email: users.email, role: users.role })

    return reply.code(201).send(user)
  })
}
