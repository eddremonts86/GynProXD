import type { RecipeSuggestion } from '../lib/recipes'

/**
 * Ingredients and numbered steps, folded by default so the card stays a
 * card. Only rendered when the catalogue actually delivered directions —
 * sample dishes and legacy cached payloads simply do not show it.
 */
export function RecipePreparation({ dish }: { dish: RecipeSuggestion }) {
  if (!dish.directions || dish.directions.length === 0) return null
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-2xs font-medium text-brand">
        How to make it
      </summary>
      {dish.ingredients && dish.ingredients.length > 0 && (
        <ul className="mt-1.5 flex list-disc flex-col gap-0.5 pl-4 text-2xs leading-relaxed text-ink-3">
          {dish.ingredients.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-4 text-2xs leading-relaxed text-ink-3">
        {dish.directions.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </details>
  )
}
