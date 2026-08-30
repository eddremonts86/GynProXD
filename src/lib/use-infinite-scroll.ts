import { useEffect, useState } from 'react'

/**
 * Load the next page when the end of the list comes into view. The sentinel is
 * observed rather than the scroll position, so nothing runs on every frame and
 * there is no scroll listener to throttle.
 *
 * `rootMargin` reaches ahead of the viewport so the next page is already
 * arriving by the time the reader gets there. Callers must memoise `onReach`
 * (useCallback) and drop `enabled` while a load is in flight, or the observer
 * will ask again for the page it is already fetching.
 *
 * Returns a ref callback for the sentinel element. Where IntersectionObserver
 * is missing the hook simply does nothing, which is why the pages keep a real
 * button as well: it is also how someone reaches the next page from the
 * keyboard, without scrolling.
 */
export function useInfiniteScroll(
  onReach: () => void,
  enabled: boolean,
  rootMargin = '600px',
): (node: HTMLElement | null) => void {
  const [node, setNode] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!node || !enabled) return undefined
    if (typeof IntersectionObserver === 'undefined') return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onReach()
      },
      { rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, enabled, onReach, rootMargin])

  return setNode
}
