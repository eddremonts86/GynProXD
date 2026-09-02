/**
 * A gym's colour, and what may be written on it.
 *
 * The gym picks the colour; the app picks the ink. Refusing somebody's actual
 * brand because it fails a ratio would be refusing the feature they paid for,
 * and darkening it into compliance would hand them a colour that is not theirs.
 * So any colour is accepted and the text on it is chosen by measurement — the
 * same answer `--aurora-ink` reached for the one coloured material this app
 * already had.
 *
 * What the colour deliberately cannot touch is the app's own chrome. The shell
 * is where a member learns whose app holds their encrypted training; a shell
 * wearing the gym would tell them, plausibly and wrongly, that the gym holds
 * it. The colour marks the gym's own surfaces — its banner, its card, its name
 * above a message — and nothing else. See `docs/PANELS.md`.
 *
 * It also only reaches a member who has a sync account, because the colour is
 * read off the gym's row and a device with no account cannot ask. That is not a
 * gap to paper over: there is nowhere else the answer could come from, and the
 * app's own colour is the honest thing to show somebody we cannot tell.
 */

/** The app's own ink, and the two candidates for anything sitting on a brand. */
export const BRAND_INK_DARK = '#1d1d1a'
export const BRAND_INK_LIGHT = '#ffffff'

/** Small text needs 4.5:1. Everything here is small text. */
export const NEEDED = 4.5

/**
 * `#rgb`, `#rrggbb` or nothing, in any case, with or without the hash.
 *
 * Returns null rather than a fallback colour: a gym that typed something
 * unusable should be told, not quietly given a shade of grey it did not pick.
 */
export function normaliseHex(value: unknown): string | null {
  const raw = String(value ?? '').trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
  }
  return /^[0-9a-f]{6}$/.test(raw) ? `#${raw}` : null
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

/** WCAG contrast ratio between two hex colours, lighter over darker. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)]
  const [hi, lo] = x > y ? [x, y] : [y, x]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Which ink to write on this colour.
 *
 * Whichever of the two clears more, rather than a luminance threshold: a
 * threshold picks the same answer most of the time and the wrong one in the
 * middle of the range, where the two are close and the difference matters most.
 */
export function inkOn(brand: string): string {
  const dark = contrastRatio(brand, BRAND_INK_DARK)
  const light = contrastRatio(brand, BRAND_INK_LIGHT)
  return dark >= light ? BRAND_INK_DARK : BRAND_INK_LIGHT
}

/**
 * Whether small text on this colour is legible at all.
 *
 * Not a rare edge. Measured across ordinary brand colours, the band that clears
 * 4.5:1 against neither ink runs right through the middle of the palette:
 * steel blue #4682b4 tops out at 4.11:1, slate #708090 at 4.17, sea green
 * #2e8b57 at 4.25, mid grey #808080 at 4.28, denim #5b7c99 at 4.39, olive
 * #6b8e23 at 4.44. Those are gym colours, not curiosities — the worst possible
 * case is 4.11:1, which is where a colour sits exactly between this app's ink
 * and white.
 *
 * So the fallback is the common path, not the exception: the colour keeps every
 * surface that carries no text — a rule, a dot, an edge, a fill behind nothing
 * — and the surfaces with words on them use the app's own. Said plainly in the
 * panel, because a gym that set a colour and then saw it in some places and not
 * others would reasonably think something was broken.
 */
export function carriesText(brand: string): boolean {
  return contrastRatio(brand, inkOn(brand)) >= NEEDED
}

/** The pair a surface needs, or null when the colour is unusable as typed. */
export function brandSurface(value: unknown): { bg: string; ink: string; text: boolean } | null {
  const bg = normaliseHex(value)
  if (!bg) return null
  return { bg, ink: inkOn(bg), text: carriesText(bg) }
}
