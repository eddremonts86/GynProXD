import { describe, expect, it } from 'vitest'
import { blankDraft, draftFromRecord, draftProblems, type RecipeDraft } from './recipe-draft'

const good: RecipeDraft = {
  id: null,
  title: 'Coach bowl',
  category: 'main',
  kcal: '420',
  proteinG: '38',
  servings: '2',
  readyInMinutes: '20',
  ingredients: '2 chicken breasts\n1 cup rice',
  directions: 'Season it.\nGrill it.',
  hasImage: false,
}

describe('draftProblems', () => {
  it('accepts a complete draft once a photo is attached', () => {
    expect(draftProblems(good, true)).toEqual({})
    expect(draftProblems({ ...good, hasImage: true }, false)).toEqual({})
  })

  it('insists on a photo', () => {
    expect(draftProblems(good, false).image).toBeTruthy()
  })

  it('names every missing piece of a blank draft', () => {
    const problems = draftProblems(blankDraft(), false)
    expect(Object.keys(problems).sort()).toEqual(
      ['directions', 'image', 'ingredients', 'kcal', 'proteinG', 'servings', 'title'].sort(),
    )
  })

  it('rejects macros that are zero, negative or absurd', () => {
    expect(draftProblems({ ...good, kcal: '0' }, true).kcal).toBeTruthy()
    expect(draftProblems({ ...good, proteinG: '-5' }, true).proteinG).toBeTruthy()
    expect(draftProblems({ ...good, kcal: '99999' }, true).kcal).toBeTruthy()
    expect(draftProblems({ ...good, servings: 'two' }, true).servings).toBeTruthy()
  })

  it('treats time as optional but still checks it when given', () => {
    expect(draftProblems({ ...good, readyInMinutes: '' }, true)).toEqual({})
    expect(draftProblems({ ...good, readyInMinutes: '0' }, true).readyInMinutes).toBeTruthy()
  })

  it('needs a real method, not a single line', () => {
    expect(draftProblems({ ...good, directions: 'Just cook it.' }, true).directions).toBeTruthy()
    expect(draftProblems({ ...good, directions: '  \n \n' }, true).directions).toBeTruthy()
  })
})

describe('draftFromRecord', () => {
  it('turns a stored record back into editable text', () => {
    const draft = draftFromRecord({
      id: 'abc',
      title: 'Stored dish',
      category: 'soup',
      kcal: 300,
      proteinG: 21,
      servings: 4,
      readyInMinutes: 0,
      image: 'photo.jpg',
      imageUrl: '',
      ingredients: ['a', 'b'],
      directions: ['one', 'two'],
    })
    expect(draft.id).toBe('abc')
    expect(draft.ingredients).toBe('a\nb')
    expect(draft.directions).toBe('one\ntwo')
    expect(draft.readyInMinutes).toBe('')
    expect(draft.hasImage).toBe(true)
    expect(draftProblems(draft, false)).toEqual({})
  })

  it('falls back to a known course when the stored one is unknown', () => {
    const draft = draftFromRecord({
      id: 'x', title: 'x', category: 'mystery', kcal: 1, proteinG: 1, servings: 1,
      readyInMinutes: 0, image: 'p.jpg', imageUrl: '', ingredients: [], directions: [],
    })
    expect(draft.category).toBe('other')
  })
})
