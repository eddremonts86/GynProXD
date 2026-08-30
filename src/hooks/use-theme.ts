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

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** What the operating system is asking for right now. */
function systemTheme(): Theme {
  try {
    return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#141412' : '#ecebe8')
}

/**
 * The device decides until the member does. With no stored choice the theme
 * follows the operating system and keeps following it, so someone whose
 * machine turns dark at sunset sees the app turn with it. The toggle writes a
 * choice, and a written choice wins from then on.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? systemTheme())

  useEffect(() => {
    apply(theme)
  }, [theme])

  /* Kept for the whole session rather than read once: the guard re-checks
     storage on every change, so the listener goes quiet the moment the member
     picks a side instead of overriding them at sunset. */
  useEffect(() => {
    let media: MediaQueryList
    try {
      media = window.matchMedia(DARK_QUERY)
    } catch {
      return
    }
    const onSystemChange = (event: MediaQueryListEvent) => {
      if (stored()) return
      setTheme(event.matches ? 'dark' : 'light')
    }
    media.addEventListener('change', onSystemChange)
    return () => media.removeEventListener('change', onSystemChange)
  }, [])

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
