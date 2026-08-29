import { useEffect } from 'react'
import { ArrowUpRight } from '@phosphor-icons/react'
import { useRecipes } from '../store/useRecipes'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { Section } from '../ui/PageHeader'
import { RecipePreparation } from './recipe-preparation'
import { RecipeAttribution } from './recipe-attribution'

/**
 * One good plate a day, the same one on every device: the pick is seeded by
 * the date, fetched once and cached until midnight. Lives on the menu page,
 * next to the gym's own kitchen card.
 */
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
            className="aspect-[4/3] w-full bg-surface-2 object-cover sm:w-64 sm:shrink-0"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-5">
            <h3 className="text-xl text-ink">{daily.dish.title}</h3>
            <div className="flex flex-wrap gap-1.5">
              {daily.dish.category && <Tag>{daily.dish.category}</Tag>}
              {daily.dish.area && <Tag tone="outline">{daily.dish.area}</Tag>}
            </div>
            {daily.dish.coachNote && (
              <p className="max-w-[52ch] text-sm text-ink-3">{daily.dish.coachNote}</p>
            )}
            <RecipePreparation dish={daily.dish} />
            {daily.dish.sourceUrl && (
              <a
                href={daily.dish.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-medium text-brand"
              >
                View the full recipe
                <ArrowUpRight size={14} weight="bold" />
              </a>
            )}
          </div>
        </Panel>
      )}
      {daily && <RecipeAttribution items={[daily.dish]} />}
    </Section>
  )
}
