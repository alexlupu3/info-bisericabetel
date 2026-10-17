/**
 * Generates minimal placeholder PWA icons (192x192 and 512x512) into
 * packages/app/public/icons/.
 *
 * WARNING: this OVERWRITES icon-192.png and icon-512.png in that folder.
 * The committed icons are the real ones; only use this script to bootstrap
 * placeholders (e.g. in a fork) or after backing the current icons up.
 *
 * `canvas` is intentionally NOT a project dependency (it pulls native
 * binaries). Add it temporarily, run the script, then remove it again and
 * do not commit the package.json / pnpm-lock.yaml changes:
 *
 *   pnpm add -Dw canvas
 *   node scripts/generate-icons.mjs
 *   pnpm remove -w canvas
 *
 * Requires Node >= 20.11 (uses import.meta.dirname).
 */
import { createCanvas } from 'canvas'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const SIZES = [192, 512]
const OUT_DIR = join(import.meta.dirname, '../packages/app/public/icons')

mkdirSync(OUT_DIR, { recursive: true })

for (const size of SIZES) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // Black background
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, size, size)

  // White "B" letter centered
  const fontSize = Math.floor(size * 0.55)
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${fontSize}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('B', size / 2, size / 2 + fontSize * 0.05)

  writeFileSync(join(OUT_DIR, `icon-${size}.png`), canvas.toBuffer('image/png'))
  console.log(`✓ icon-${size}.png`)
}
