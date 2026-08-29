import { useEffect } from 'react'
import { ArrowRight } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useRecipes } from '../store/useRecipes'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { Section } from '../ui/PageHeader'
import type { RecipeSuggestion } from '../lib/recipes'
import { RecipeAttribution } from './recipe-attribution'


/**
 * One good plate a day, the same one on every device: the pick is seeded by
 * the date, fetched once and cached until midnight. Lives on the menu page,
 * next to the gym's own kitchen card.
 */
/** What the plate involves, in one line, from what the catalogue actually holds. */
function shapeOf(dish: RecipeSuggestion): string {
  const parts: string[] = []
  if (dish.ingredients && dish.ingredients.length > 0) {
    parts.push(`${dish.ingredients.length} ingredients`)
  }
  if (dish.directions && dish.directions.length > 0) {
    parts.push(`${dish.directions.length} steps`)
  }
  if (dish.servings !== undefined) parts.push(`makes ${Math.round(dish.servings)}`)
  return parts.join(' · ')
}

export function DishOfTheDay() {
  const daily = useRecipes((s) => s.daily)
  const loading = useRecipes((s) => s.loadingDaily)
  const ensureDaily = useRecipes((s) => s.ensureDaily)

  useEffect(() => {
    void ensureDaily()
  }, [ensureDaily])

  if (!daily && !loading) return null

  return (
    <Section title="Dish of the day" hint={daily?.dish.category}>
      {!daily ? (
        <Panel padding="lg">
          <p className="text-sm text-ink-3">Picking today&apos;s plate…</p>
        </Panel>
      ) : (
        <Panel padding="none" className="overflow-hidden sm:flex">
          <img
            src={daily.dish.imageUrl}
            alt={daily.dish.title}
            className="aspect-[4/3] w-full bg-surface-2 object-cover sm:aspect-auto sm:w-72 sm:shrink-0 lg:w-80"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-3 p-5 md:p-6">
            <div className="flex flex-col gap-2">
              <h3 className="text-xl leading-tight text-ink md:text-2xl">{daily.dish.title}</h3>
              <div className="flex flex-wrap gap-1.5">
                {daily.dish.category && <Tag>{daily.dish.category}</Tag>}
                {daily.dish.area && <Tag tone="outline">{daily.dish.area}</Tag>}
                {daily.dish.readyInMinutes !== undefined && (
                  <Tag tone="outline">
                    <span className="num">{daily.dish.readyInMinutes}</span>&nbsp;min
                  </Tag>
                )}
              </div>
            </div>

            {/* The numbers a member came for, and what the plate involves. */}
            {(daily.dish.kcal !== undefined || daily.dish.proteinG !== undefined) && (
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-line pt-3">
                {daily.dish.kcal !== undefined && (
                  <span className="flex items-baseline gap-1.5">
                    <span className="num text-2xl leading-none text-ink">{daily.dish.kcal}</span>
                    <span className="text-2xs text-ink-3">kcal</span>
                  </span>
                )}
                {daily.dish.proteinG !== undefined && (
                  <span className="flex items-baseline gap-1.5">
                    <span className="num text-2xl leading-none text-ink">{daily.dish.proteinG}</span>
                    <span className="text-2xs text-ink-3">g protein</span>
                  </span>
                )}
                <span className="text-2xs text-ink-3">per serving</span>
              </div>
            )}

            {daily.dish.coachNote && (
              <p className="max-w-[52ch] text-sm text-ink-3">{daily.dish.coachNote}</p>
            )}

            <p className="text-2xs text-ink-3">{shapeOf(daily.dish)}</p>

            <Link
              to="/recipe/$id"
              params={{ id: daily.dish.id }}
              className="group mt-auto inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-brand"
            >
              How to make it
              <ArrowRight
                size={14}
                weight="bold"
                className="transition-transform duration-150 group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </Panel>
      )}
      {daily && <RecipeAttribution items={[daily.dish]} />}
    </Section>
  )
}
