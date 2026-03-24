/**
 * One-time bootstrap: create the first super-admin user.
 * Usage: tsx src/scripts/seed-admin.ts <email> <password>
 */
import bcrypt from 'bcryptjs'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { users } from '../db/schema.js'

async function main() {
  const [email, password] = process.argv.slice(2)
  if (!email || !password) {
    console.error('Usage: tsx src/scripts/seed-admin.ts <email> <password>')
    process.exit(1)
  }

  const url = process.env.DATABASE_URL
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1) }

  const sql = postgres(url)
  const db = drizzle(sql)

  const hash = await bcrypt.hash(password, 12)
  const [user] = await db.insert(users).values({
    email,
    passwordHash: hash,
    role: 'super-admin',
    mustChangePassword: false,
  }).returning({ id: users.id, email: users.email, role: users.role })

  console.log('✅ Super-admin created:', user)
  await sql.end()
}

main().catch(err => { console.error(err); process.exit(1) })
