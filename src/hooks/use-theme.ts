import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
const STORAGE_KEY = 'forma-theme'

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#141412' : '#ecebe8')
}

/**
 * Light-first: the design language is built around chalk surfaces, so light is
 * the default rather than the system preference. Dark stays one tap away and
 * the choice persists.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? 'light')

  useEffect(() => {
    apply(theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // private mode: the choice just does not survive a reload
      }
      return next
    })
  }, [])

  return { theme, toggle }
}
