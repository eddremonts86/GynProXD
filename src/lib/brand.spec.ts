import { describe, expect, it } from 'vitest'
import {
  BRAND_INK_DARK,
  BRAND_INK_LIGHT,
  brandSurface,
  carriesText,
  contrastRatio,
  inkOn,
  NEEDED,
  normaliseHex,
} from './brand'

describe('normaliseHex', () => {
  it('takes the forms people actually type', () => {
    expect(normaliseHex('#A8560F')).toBe('#a8560f')
    expect(normaliseHex('a8560f')).toBe('#a8560f')
    expect(normaliseHex('  #F00  ')).toBe('#ff0000')
  })

  it('returns null rather than a colour nobody picked', () => {
    // A gym that typed something unusable is told, not quietly given grey.
    for (const bad of ['', 'red', '#12345', '#gggggg', null, undefined, 42]) {
      expect(normaliseHex(bad)).toBeNull()
    }
  })
})

describe('contrastRatio', () => {
  it('agrees with the two ends of the scale', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
  })

  it('does not care which way round it is asked', () => {
    expect(contrastRatio('#a8560f', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#a8560f'),
      10,
    )
  })
})

/**
 * The decision the feature turns on: a gym picks the colour, the app picks the
 * ink. Refusing somebody's brand for failing a ratio refuses the thing they
 * paid for; darkening it hands them a colour that is not theirs.
 */
describe('inkOn', () => {
  it('writes dark on a pale brand and light on a deep one', () => {
    expect(inkOn('#fde68a')).toBe(BRAND_INK_DARK)
    expect(inkOn('#1e3a5f')).toBe(BRAND_INK_LIGHT)
  })

  it('picks whichever actually measures better, not a threshold', () => {
    // Around the middle the two are close, and a luminance cutoff picks the
    // wrong one exactly where the difference matters most. Walked across the
    // range: the answer must always be the better of the two, by measurement.
    for (const brand of ['#6b8e23', '#4682b4', '#808080', '#8b4513', '#20b2aa', '#c71585']) {
      const chosen = inkOn(brand)
      const other = chosen === BRAND_INK_DARK ? BRAND_INK_LIGHT : BRAND_INK_DARK
      expect(
        contrastRatio(brand, chosen),
        `${brand} should take ${chosen}`,
      ).toBeGreaterThanOrEqual(contrastRatio(brand, other))
    }
  })
})

describe('carriesText', () => {
  it('says yes when the better ink clears 4.5:1', () => {
    expect(carriesText('#1e3a5f')).toBe(true)
    expect(contrastRatio('#1e3a5f', inkOn('#1e3a5f'))).toBeGreaterThanOrEqual(NEEDED)
  })

  it('says no for the whole band neither ink can carry', () => {
    // Measured, not guessed: the first version of this test picked
    // lightseagreen as its "awkward" colour and lightseagreen clears 6.44:1.
    // The band that fails runs through the middle of the palette and is full
    // of perfectly ordinary gym colours, which is why the fallback is the
    // common path rather than an edge case.
    const cannot = {
      'steel blue': '#4682b4',
      slate: '#708090',
      'sea green': '#2e8b57',
      'mid grey': '#808080',
      denim: '#5b7c99',
      olive: '#6b8e23',
    }
    for (const [name, hex] of Object.entries(cannot)) {
      expect(carriesText(hex), `${name} ${hex}`).toBe(false)
      expect(contrastRatio(hex, inkOn(hex))).toBeLessThan(NEEDED)
    }
  })

  it('and yes for colours on either side of it', () => {
    for (const hex of ['#1e3a5f', '#fde68a', '#8b4513', '#c71585', '#20b2aa']) {
      expect(carriesText(hex), hex).toBe(true)
    }
  })
})

describe('brandSurface', () => {
  it('hands a surface everything it needs in one go', () => {
    expect(brandSurface('#1e3a5f')).toEqual({ bg: '#1e3a5f', ink: '#ffffff', text: true })
  })

  it('is null for a colour nobody can use', () => {
    expect(brandSurface('not a colour')).toBeNull()
  })
})
