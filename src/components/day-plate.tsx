import { Link } from '@tanstack/react-router'
import { ArrowRight } from '@phosphor-icons/react'
import { dishTotals, type RecipeSuggestion } from '../lib/recipes'
import { cn } from '@/lib/utils'

/** The day's plate as a link: the whole row opens the recipe. */
export function DayPlate({
  dish,
  className,
  tone = 'quiet',
}: {
  dish: RecipeSuggestion
  className?: string
  /** 'quiet' sits inside a card; 'panel' stands alone with its own border. */
  tone?: 'quiet' | 'panel'
}) {
  const plate = dishTotals(dish)
  const parts: string[] = []
  if (plate.portions > 1) parts.push(`${plate.portions} servings`)
  if (plate.kcal !== undefined) parts.push(`${plate.kcal} kcal`)
  if (plate.proteinG !== undefined) parts.push(`${plate.proteinG} g protein`)

  return (
    <Link
      to="/recipe/$id"
      params={{ id: dish.id }}
      search={plate.portions > 1 ? { p: plate.portions } : {}}
      className={cn(
        'group flex items-center gap-2.5 rounded-lg transition-colors duration-150',
        tone === 'panel' ? 'border border-line p-2.5 hover:bg-surface-2' : 'py-1 hover:opacity-80',
        className,
      )}
    >
      <img
        src={dish.imageUrl}
        alt=""
        loading="lazy"
        className="size-10 shrink-0 rounded-lg bg-surface-2 object-cover"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-2xs font-medium text-ink-2">{dish.title}</span>
        <span className="num text-2xs text-ink-3">{parts.join(' · ')}</span>
      </span>
      <ArrowRight
        size={13}
        weight="bold"
        className="shrink-0 text-brand transition-transform duration-150 group-hover:translate-x-0.5"
      />
    </Link>
  )
}
