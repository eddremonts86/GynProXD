import { describe, expect, it } from 'vitest'
import { validCollectionIds } from './collection'

describe('validCollectionIds', () => {
  const known = (id: string) => ['a', 'b', 'c'].includes(id)

  it('keeps known ids in order', () => {
    expect(validCollectionIds(['b', 'a'], known)).toEqual(['b', 'a'])
  })

  it('drops unknown ids and duplicates', () => {
    expect(validCollectionIds(['a', 'zzz', 'a', 'c'], known)).toEqual(['a', 'c'])
  })

  it('drops non-strings without throwing', () => {
    expect(validCollectionIds([null as unknown as string, 'a'], known)).toEqual(['a'])
  })
})
