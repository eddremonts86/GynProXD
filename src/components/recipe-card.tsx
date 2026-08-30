import { ArrowRight, ArrowUpRight } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { dishTotals, type RecipeSuggestion } from '../lib/recipes'
import { cn } from '@/lib/utils'

/** One suggested plate: photo, the numbers that matter, the coach's sentence. */
export function RecipeCard({
  dish,
  className,
}: {
  dish: RecipeSuggestion
  className?: string
}) {
  const plate = dishTotals(dish)
  return (
    <Panel padding="none" className={cn('flex flex-col overflow-hidden', className)}>
      <img
        src={dish.imageUrl}
        alt={dish.title}
        loading="lazy"
        className="aspect-[4/3] w-full bg-surface-2 object-cover"
      />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-sm font-semibold text-ink">{dish.title}</h3>
        <div className="flex flex-wrap gap-1.5">
          {plate.portions > 1 && (
            <Tag tone="outline">
              <span className="num">{plate.portions}</span>&nbsp;servings
            </Tag>
          )}
          {plate.kcal !== undefined && (
            <Tag>
              <span className="num">{plate.kcal}</span>&nbsp;kcal
            </Tag>
          )}
          {plate.proteinG !== undefined && (
            <Tag tone="brand">
              <span className="num">{plate.proteinG}</span>&nbsp;g protein
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
        {/* Catalogue plates open in the app, where the method lives; the
            bundled samples have no page of their own, so they still link out. */}
        {dish.provider === 'sample'
          ? dish.sourceUrl && (
              <a
                href={dish.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-auto inline-flex items-center gap-1 pt-1 text-2xs font-medium text-brand"
              >
                View recipe
                <ArrowUpRight size={12} weight="bold" />
              </a>
            )
          : (
              <Link
                to="/recipe/$id"
                params={{ id: dish.id }}
                search={plate.portions > 1 ? { p: plate.portions } : {}}
                className="group mt-auto inline-flex items-center gap-1 pt-1 text-2xs font-medium text-brand"
              >
                How to make it
                <ArrowRight
                  size={12}
                  weight="bold"
                  className="transition-transform duration-150 group-hover:translate-x-0.5"
                />
              </Link>
            )}
      </div>
    </Panel>
  )
}
