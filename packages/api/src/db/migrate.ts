import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { sql } from './client.js'

export async function runMigrations() {
  // Track applied migrations
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  const migrationsDir = join(__dirname, 'migrations')
  const files = (await readdir(migrationsDir))
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const [existing] = await sql`
      SELECT name FROM _migrations WHERE name = ${file}
    `
    if (existing) continue

    const content = await readFile(join(migrationsDir, file), 'utf-8')
    await sql.begin(async tx => {
      await tx.unsafe(content)
      // TransactionSql loses call signatures via Omit in postgres.js types, but is callable at runtime
      await (tx as unknown as typeof sql)`INSERT INTO _migrations (name) VALUES (${file})`
    })
    console.log(`migration applied: ${file}`)
  }
}
