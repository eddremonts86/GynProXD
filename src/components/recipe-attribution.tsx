import type { ReactNode } from 'react'
import type { RecipeSuggestion } from '../lib/recipes'

/**
 * The source line under recipe content. FatSecret's terms require visible
 * attribution wherever their content displays (and that the link outlives
 * our use of the API); public-domain rows get a courtesy credit; samples
 * keep crediting TheMealDB for the bundled photos.
 */
export function RecipeAttribution({ items }: { items: RecipeSuggestion[] }) {
  const providers = new Set(items.map((d) => d.provider))
  const parts: ReactNode[] = []
  if (providers.has('fatsecret')) {
    parts.push(
      <a
        key="fs"
        href="https://platform.fatsecret.com"
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2"
      >
        Powered by fatsecret
      </a>,
    )
  }
  if (providers.has('pd')) {
    parts.push(<span key="pd">Recipes and nutrition from USDA MyPlate (public domain)</span>)
  }
  /* House recipes are the gym's own: nobody to credit but itself. */
  if (providers.has('house') && providers.size === 1) {
    parts.push(<span key="house">Written by your gym</span>)
  }
  if (providers.has('sample')) {
    parts.push(
      <span key="sample">
        Sample dishes with editorial estimates; photos from{' '}
        <a
          href="https://www.themealdb.com"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          TheMealDB
        </a>
      </span>,
    )
  }
  if (parts.length === 0) return null
  return (
    <p className="text-2xs text-ink-3">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {part}
        </span>
      ))}
      .
    </p>
  )
}
