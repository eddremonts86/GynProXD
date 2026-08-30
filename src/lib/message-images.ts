/**
 * Pictures for a gym broadcast.
 *
 * The gym is the paying side and it sells things: a clinic, a clip card, a
 * plate of food. One line of text was never going to do that. What follows is
 * the smallest honest version of an upload — pick, look, describe, remove —
 * with the resizing done here rather than asked of the operator, because a gym
 * owner photographing a plate on their phone should not have to know what
 * 4032 pixels costs everyone downstream.
 */

/** A broadcast, not an album. */
export const MAX_IMAGES = 4

/** Refused before any work is done on it. */
export const MAX_SOURCE_BYTES = 12 * 1024 * 1024

/** Wide enough to fill a card on a 2× display, small enough to be free. */
export const TARGET_WIDTH = 1400

/** Visibly lossless at card size, roughly a fifth of the bytes. */
const QUALITY = 0.82

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export interface PendingImage {
  /** Stable across re-renders so React keys and alt-text edits stay put. */
  id: string
  file: File
  /** Object URL for the thumbnail; revoked when the picker drops it. */
  preview: string
  alt: string
}

export interface ImageProblem {
  name: string
  reason: string
}

/** What a file has to be before it is worth decoding. */
export function rejectionFor(file: File, alreadyPicked: number): string | null {
  if (alreadyPicked >= MAX_IMAGES) return `Four pictures is the limit.`
  if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
    return 'JPEG, PNG or WebP only.'
  }
  if (file.size > MAX_SOURCE_BYTES) return 'Larger than 12 MB — resize it first.'
  return null
}

/**
 * Down to `TARGET_WIDTH` and out as JPEG.
 *
 * A picture already narrower than the target is returned untouched: re-encoding
 * it would only cost quality. Anything else is drawn once into a canvas — the
 * browser's own scaler is good enough at this ratio, and a manual pyramid would
 * be a lot of code for a difference nobody can see in a 600px card.
 */
export async function downscale(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function') return file
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    /* A file the browser cannot decode is one the server will refuse too, but
       that refusal is the server's to make, with a message. */
    return file
  }
  try {
    if (bitmap.width <= TARGET_WIDTH) return file
    const scale = TARGET_WIDTH / bitmap.width
    const width = TARGET_WIDTH
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    )
    if (!blob || blob.size >= file.size) return file
    return new File([blob], renamed(file.name), { type: 'image/jpeg' })
  } finally {
    bitmap.close()
  }
}

function renamed(original: string): string {
  const stem = original.replace(/\.[^.]+$/, '') || 'image'
  return `${stem}.jpg`
}

/** Human-readable size, for the picker's caption. */
export function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
