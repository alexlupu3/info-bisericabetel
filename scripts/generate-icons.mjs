/**
 * Generates minimal placeholder PWA icons (192x192 and 512x512).
 * Run once: node scripts/generate-icons.mjs
 * Replace with real brand icons before launch.
 */
import { createCanvas } from 'canvas'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const SIZES = [192, 512]
const OUT_DIR = join(import.meta.dirname, '../packages/pwa/public/icons')

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
