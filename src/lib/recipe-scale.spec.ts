import { describe, expect, it } from 'vitest'
import { formatQuantity, parseLeadingQuantity, scaleIngredient } from './recipe-scale'

describe('parseLeadingQuantity', () => {
  it('reads the shapes USDA ingredient lines actually use', () => {
    expect(parseLeadingQuantity('1 tablespoon vegetable oil')).toEqual({
      value: 1,
      rest: 'tablespoon vegetable oil',
    })
    expect(parseLeadingQuantity('1/4 teaspoon cayenne pepper')).toEqual({
      value: 0.25,
      rest: 'teaspoon cayenne pepper',
    })
    expect(parseLeadingQuantity('1 1/2 cups milk')).toEqual({ value: 1.5, rest: 'cups milk' })
    expect(parseLeadingQuantity('0.5 pound beef')).toEqual({ value: 0.5, rest: 'pound beef' })
    expect(parseLeadingQuantity('½ cup rice')).toEqual({ value: 0.5, rest: 'cup rice' })
  })

  it('is null when the line does not start with an amount', () => {
    expect(parseLeadingQuantity('Salt and pepper to taste')).toBeNull()
    expect(parseLeadingQuantity('')).toBeNull()
  })
})

describe('formatQuantity', () => {
  it('writes amounts the way a recipe would', () => {
    expect(formatQuantity(0.25)).toBe('1/4')
    expect(formatQuantity(0.5)).toBe('1/2')
    expect(formatQuantity(0.75)).toBe('3/4')
    expect(formatQuantity(1)).toBe('1')
    expect(formatQuantity(1.5)).toBe('1 1/2')
    expect(formatQuantity(2)).toBe('2')
    expect(formatQuantity(1 / 3)).toBe('1/3')
  })

  it('falls back to a decimal when no tidy fraction fits', () => {
    expect(formatQuantity(1.07)).toBe('1.1')
  })
})

describe('scaleIngredient', () => {
  it('scales the leading amount and leaves the rest of the line alone', () => {
    expect(scaleIngredient('1/4 teaspoon cayenne pepper', 3)).toBe('3/4 teaspoon cayenne pepper')
    expect(scaleIngredient('2 celery stalks, chopped', 2)).toBe('4 celery stalks, chopped')
    expect(scaleIngredient('1 can (14.5 ounces) diced tomatoes', 2)).toBe(
      '2 cans (14.5 ounces) diced tomatoes',
    )
  })

  it('finds the unit when an ingredient word comes first', () => {
    // "celery stalks", "garlic cloves": the measured thing is the second word.
    expect(scaleIngredient('2 celery stalks, chopped', 0.5)).toBe('1 celery stalk, chopped')
    expect(scaleIngredient('2 garlic cloves, minced', 2)).toBe('4 garlic cloves, minced')
    expect(scaleIngredient('1 garlic clove', 3)).toBe('3 garlic cloves')
  })

  it('leaves words that are not measurements alone', () => {
    // "pepper" is the food, not a unit: no pluralisation rule applies.
    expect(scaleIngredient('1 large green pepper, chopped', 2)).toBe(
      '2 large green pepper, chopped',
    )
  })

  it('pluralises the unit only when crossing one', () => {
    expect(scaleIngredient('1 cup chili sauce', 2)).toBe('2 cups chili sauce')
    expect(scaleIngredient('1 cup chili sauce', 0.5)).toBe('1/2 cup chili sauce')
    expect(scaleIngredient('2 cups milk', 0.5)).toBe('1 cup milk')
  })

  it('returns the line untouched when there is nothing to scale', () => {
    expect(scaleIngredient('Salt and pepper to taste', 3)).toBe('Salt and pepper to taste')
    expect(scaleIngredient('1 cup rice', 1)).toBe('1 cup rice')
  })
})
