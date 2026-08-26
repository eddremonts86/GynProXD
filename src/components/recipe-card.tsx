import { ArrowUpRight } from '@phosphor-icons/react'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import type { RecipeSuggestion } from '../lib/recipes'

/** One suggested plate: photo, the numbers that matter, the coach's sentence. */
export function RecipeCard({ dish }: { dish: RecipeSuggestion }) {
  return (
    <Panel padding="none" className="flex flex-col overflow-hidden">
      <img
        src={dish.imageUrl}
        alt={dish.title}
        loading="lazy"
        className="aspect-[4/3] w-full bg-surface-2 object-cover"
      />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-sm font-semibold text-ink">{dish.title}</h3>
        <div className="flex flex-wrap gap-1.5">
          {dish.kcal !== undefined && (
            <Tag>
              <span className="num">{dish.kcal}</span>&nbsp;kcal
            </Tag>
          )}
          {dish.proteinG !== undefined && (
            <Tag tone="brand">
              <span className="num">{dish.proteinG}</span>&nbsp;g protein
            </Tag>
          )}
          {dish.readyInMinutes !== undefined && (
            <Tag tone="outline">
              <span className="num">{dish.readyInMinutes}</span>&nbsp;min
            </Tag>
          )}
        </div>
        {dish.coachNote && (
          <p className="text-2xs leading-relaxed text-ink-3">{dish.coachNote}</p>
        )}
        {dish.sourceUrl && (
          <a
            href={dish.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-auto inline-flex items-center gap-1 pt-1 text-2xs font-medium text-brand"
          >
            View recipe
            <ArrowUpRight size={12} weight="bold" />
          </a>
        )}
      </div>
    </Panel>
  )
}
