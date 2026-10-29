// Crawler-safe share images (spec 06 FR-087, §6.5): 1200×630 progressive JPEGs under
// <UPLOADS_DIR>/og/, built on first request and kept forever (immutable names).
//   <media-uuid>.jpg   the upload letter-boxed over a blurred, darkened copy of itself
//   brand-<hex>.jpg    the hub logo centred on a solid accent colour
// Every file is ≤ OG_MAX_BYTES, guaranteed by a deterministic size guard.

import { existsSync, mkdirSync } from 'fs'
import { rename, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'
import { NEUTRAL_ACCENT, OG_NAME_PATTERN } from './preview-image.js'

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630
export const OG_MAX_BYTES = 300_000

/** Size guard (§6.5 step 4): the first encoding ≤ OG_MAX_BYTES wins. All 1.91:1. */
const ENCODINGS: ReadonlyArray<{ width: number; height: number; quality: number }> = [
  { width: 1200, height: 630, quality: 82 },
  { width: 1200, height: 630, quality: 72 },
  { width: 1200, height: 630, quality: 62 },
  { width: 1200, height: 630, quality: 50 },
  { width: 900, height: 472, quality: 62 },
  { width: 600, height: 314, quality: 62 },
]

export interface OgImage {
  /** File name inside the og/ folder. */
  name: string
  width: number
  height: number
}

let uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), '..', 'uploads')
let brandSources: string[] = []

/** Called at startup: where uploads live and which logo files to try for brand images. */
export function configureOgImages(opts: { uploadsDir: string; brandSources: string[] }): void {
  uploadsDir = opts.uploadsDir
  brandSources = opts.brandSources
}

/** Folder of the stored derivatives. */
export function ogDir(): string {
  return join(uploadsDir, 'og')
}

type Composer = (width: number, height: number) => Promise<Buffer>

function mediaComposer(source: string): Composer {
  return async (width, height) => {
    const background = await sharp(source)
      .resize(width, height, { fit: 'cover' })
      .blur(30)
      .modulate({ brightness: 0.6 })
      .toBuffer()
    const foreground = await sharp(source)
      .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    return sharp(background).composite([{ input: foreground }]).png().toBuffer()
  }
}

function brandComposer(source: string, hex: string): Composer {
  return async (width, height) => {
    const logoSize = Math.round(height * 0.6)
    const logo = await sharp(source).resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    return sharp({ create: { width, height, channels: 3, background: `#${hex}` } })
      .composite([{ input: logo }])
      .png()
      .toBuffer()
  }
}

function encode(composed: Buffer, quality: number): Promise<Buffer> {
  return sharp(composed)
    .flatten({ background: '#000000' })
    .toColourspace('srgb')
    .jpeg({ quality, progressive: true, mozjpeg: true })
    .toBuffer()
}

/** Runs the size guard; null when even the smallest encoding is over the bound. */
async function encodeWithinBound(compose: Composer, label: string): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  let composed: { width: number; buffer: Buffer } | null = null
  for (const step of ENCODINGS) {
    if (!composed || composed.width !== step.width) composed = { width: step.width, buffer: await compose(step.width, step.height) }
    const buffer = await encode(composed.buffer, step.quality)
    if (buffer.length <= OG_MAX_BYTES) {
      if (step.width !== OG_WIDTH) console.warn(`og-image: ${label} reduced to ${step.width}×${step.height} to stay ≤ ${OG_MAX_BYTES} bytes`)
      return { buffer, width: step.width, height: step.height }
    }
  }
  return null
}

function brandSource(): string | null {
  return brandSources.find(p => existsSync(p)) ?? null
}

async function buildBrand(hex: string): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  const source = brandSource()
  if (!source) return null
  return encodeWithinBound(brandComposer(source, hex), `brand-${hex}`)
}

async function build(name: string): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  const brand = /^brand-([0-9a-f]{6})\.jpg$/.exec(name)
  if (brand) return buildBrand(brand[1])

  const uuid = name.slice(0, -'.jpg'.length)
  const source = join(uploadsDir, `${uuid}.webp`)
  if (!existsSync(source)) return null
  const result = await encodeWithinBound(mediaComposer(source), name)
  if (result) return result
  // Final fallback (§6.5 step 4.3): the brand image, stored under the media name.
  console.warn(`og-image: ${name} exceeds ${OG_MAX_BYTES} bytes at every size; using the brand image`)
  return buildBrand(NEUTRAL_ACCENT)
}

const inFlight = new Map<string, Promise<OgImage | null>>()
const dimensions = new Map<string, OgImage>()

async function readStored(name: string): Promise<OgImage | null> {
  const cached = dimensions.get(name)
  if (cached) return cached
  const file = join(ogDir(), name)
  if (!existsSync(file)) return null
  const meta = await sharp(file).metadata()
  const image = { name, width: meta.width ?? OG_WIDTH, height: meta.height ?? OG_HEIGHT }
  dimensions.set(name, image)
  return image
}

async function generate(name: string): Promise<OgImage | null> {
  const stored = await readStored(name)
  if (stored) return stored
  const result = await build(name)
  if (!result) return null
  mkdirSync(ogDir(), { recursive: true })
  const file = join(ogDir(), name)
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, result.buffer)
  await rename(tmp, file)
  const image = { name, width: result.width, height: result.height }
  dimensions.set(name, image)
  return image
}

/**
 * The stored derivative `name` (`<uuid>.jpg` or `brand-<hex>.jpg`), generated on first
 * use; concurrent first requests share one job. Null for a malformed name or a missing
 * source upload.
 */
export function ensureOgImage(name: string): Promise<OgImage | null> {
  if (!OG_NAME_PATTERN.test(name)) return Promise.resolve(null)
  let job = inFlight.get(name)
  if (!job) {
    job = generate(name).finally(() => inFlight.delete(name))
    inFlight.set(name, job)
  }
  return job
}

/** Deletes the derivative of a media file (`<uuid>.webp` → og/<uuid>.jpg); missing is fine. */
export async function deleteOgDerivative(mediaFilename: string): Promise<void> {
  const match = /^([0-9a-f-]{36})\.webp$/.exec(mediaFilename)
  if (!match) return
  const name = `${match[1]}.jpg`
  dimensions.delete(name)
  try {
    await unlink(join(ogDir(), name))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
}
