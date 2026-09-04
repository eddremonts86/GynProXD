import { describe, expect, it } from 'vitest'
import {
  DAYS_AHEAD,
  clampDay,
  isWithinWindow,
  isoPlusDays,
  lastDay,
  relativeDayLabel,
  stepDay,
} from './day-window'

/* A fixed "today" throughout, so none of this depends on when it is run. It is
   a Thursday, and it crosses a month end on purpose: the arithmetic that gets
   this wrong gets it wrong at the boundary. */
const TODAY = '2026-09-03'

describe('isoPlusDays', () => {
  it('walks forwards and backwards over a month end', () => {
    expect(isoPlusDays('2026-09-03', 1, TODAY)).toBe('2026-09-04')
    expect(isoPlusDays('2026-09-30', 1, TODAY)).toBe('2026-10-01')
    expect(isoPlusDays('2026-10-01', -1, TODAY)).toBe('2026-09-30')
    expect(isoPlusDays('2026-12-31', 1, TODAY)).toBe('2027-01-01')
  })

  it('walks over a leap day rather than through a hole', () => {
    expect(isoPlusDays('2028-02-28', 1, TODAY)).toBe('2028-02-29')
    expect(isoPlusDays('2027-02-28', 1, TODAY)).toBe('2027-03-01')
  })

  it('answers today to nonsense rather than throwing', () => {
    expect(isoPlusDays('', 1, TODAY)).toBe(TODAY)
    expect(isoPlusDays('tomorrow', 1, TODAY)).toBe(TODAY)
    expect(isoPlusDays('03-09-2026', 1, TODAY)).toBe(TODAY)
  })
})

describe('the window', () => {
  it('is today plus the three weeks a calendar import reads', () => {
    expect(DAYS_AHEAD).toBe(21)
    expect(lastDay(TODAY)).toBe('2026-09-24')
  })

  it('holds today and the far end, and nothing either side of them', () => {
    expect(isWithinWindow(TODAY, TODAY)).toBe(true)
    expect(isWithinWindow('2026-09-24', TODAY)).toBe(true)
    expect(isWithinWindow('2026-09-02', TODAY)).toBe(false)
    expect(isWithinWindow('2026-09-25', TODAY)).toBe(false)
    expect(isWithinWindow('nope', TODAY)).toBe(false)
  })
})

describe('clampDay', () => {
  it('keeps a day inside the window', () => {
    expect(clampDay('2026-09-10', TODAY)).toBe('2026-09-10')
  })

  it('brings a tab left open overnight back to today rather than refusing', () => {
    expect(clampDay('2026-09-02', TODAY)).toBe(TODAY)
    expect(clampDay(undefined, TODAY)).toBe(TODAY)
    expect(clampDay('not-a-date', TODAY)).toBe(TODAY)
  })

  it('stops at the far end rather than running past it', () => {
    expect(clampDay('2027-01-01', TODAY)).toBe('2026-09-24')
  })
})

describe('stepDay', () => {
  it('walks forwards and back', () => {
    expect(stepDay(TODAY, 1, TODAY)).toBe('2026-09-04')
    expect(stepDay('2026-09-04', -1, TODAY)).toBe(TODAY)
  })

  it('has nowhere to go before today or after the far end', () => {
    /* Null rather than a clamp, so the screen can disable the arrow instead of
       drawing one that does nothing. */
    expect(stepDay(TODAY, -1, TODAY)).toBeNull()
    expect(stepDay('2026-09-24', 1, TODAY)).toBeNull()
  })
})

describe('relativeDayLabel', () => {
  it('names the two days worth naming and no others', () => {
    expect(relativeDayLabel(TODAY, TODAY)).toBe('Today')
    expect(relativeDayLabel('2026-09-04', TODAY)).toBe('Tomorrow')
    expect(relativeDayLabel('2026-09-05', TODAY)).toBeNull()
  })
})
