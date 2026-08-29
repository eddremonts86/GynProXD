import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowUpRight, CookingPot, ForkKnife, Minus, Plus, Users } from '@phosphor-icons/react'
import { fetchRecipe, showsSourceLink, type RecipeSuggestion } from '../lib/recipes'
import { scaleIngredient } from '../lib/recipe-scale'
import { useRecipes } from '../store/useRecipes'
import { RecipeFlow } from '@/components/recipe-flow'
import { RecipeAttribution } from '@/components/recipe-attribution'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { IconButton } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'

/**
 * One recipe, in full: the photo, what to buy, and the method as a flow you
 * cook along with. This page is why the cards no longer carry a fold — the
 * steps deserve room, and a recipe you are actually cooking from should have
 * its own address you can leave open on the counter.
 *
 * Two different questions get two different controls, because conflating them
 * is exactly what makes recipe pages confusing: how much you are eating (which
 * moves the nutrition, and is what a plan-aligned suggestion promised) and how
 * big a batch you are cooking (which moves the shopping list). Each sits next
 * to the thing it changes. Both are arithmetic on what the source measured.
 */
export function RecipePage() {
  const { id } = useParams({ from: '/recipe/$id' })
  const { p } = useSearch({ from: '/recipe/$id' })
  const reduceMotion = useReducedMotion()

  /* Whatever the app already holds paints instantly; the server fills in the
     rest (a cached suggestion carries every field, a stale one may not). */
  const cached = useRecipes((s) => {
    if (s.daily?.dish.id === id) return s.daily.dish
    return s.suggestions?.items.find((i) => i.id === id)
  })

  const [dish, setDish] = useState<RecipeSuggestion | null>(cached ?? null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>(
    cached ? 'ready' : 'loading',
  )
  /* What lands on your plate: drives the nutrition, seeded by the suggestion. */
  const [plate, setPlate] = useState(Math.max(1, p ?? 1))
  /* How many servings you are cooking: drives the ingredient amounts. */
  const [batch, setBatch] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    void fetchRecipe(id).then((fetched) => {
      if (!live) return
      if (fetched) {
        setDish(fetched)
        setState('ready')
      } else {
        setState((prev) => (prev === 'ready' ? 'ready' : 'missing'))
      }
    })
    return () => {
      live = false
    }
  }, [id])

  const macros = useMemo(() => {
    if (!dish) return []
    const scale = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * plate))
    return [
      { label: 'kcal', value: scale(dish.kcal) },
      { label: 'g protein', value: scale(dish.proteinG) },
    ].filter((m) => m.value !== undefined)
  }, [dish, plate])

  if (state === 'loading') return <RecipeSkeleton />

  if (!dish || state === 'missing') {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <EmptyState
          icon={<CookingPot size={20} />}
          title="That recipe is not on this server"
          description="It may have been a live search result that has since rolled over. Pick another plate from Today."
          action={
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink shadow-[var(--shadow-panel)] transition-colors hover:bg-surface-2"
            >
              Back to Today
            </Link>
          }
        />
      </div>
    )
  }

  const yieldsServings = dish.servings !== undefined && dish.servings >= 1
    ? Math.round(dish.servings)
    : null
  const cooking = batch ?? yieldsServings ?? 1
  const maxPlate = Math.max(1, Math.min(12, yieldsServings ?? 6))

  return (
    <div className="flex flex-col gap-8">
      <BackLink />

      {/* Asymmetric on wide screens, stacked on a phone in a kitchen. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.99 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 20 }}
        >
          <Panel padding="none" className="overflow-hidden">
            <img
              src={dish.imageUrl}
              alt={dish.title}
              className="aspect-[4/3] w-full bg-surface-2 object-cover"
            />
          </Panel>
        </motion.div>

        <div className="flex flex-col gap-5 lg:pt-2">
          <div className="flex flex-col gap-2.5">
            <h1 className="text-3xl leading-tight text-ink md:text-4xl">{dish.title}</h1>
            <div className="flex flex-wrap gap-1.5">
              {dish.category && <Tag>{dish.category}</Tag>}
              {dish.readyInMinutes !== undefined && (
                <Tag tone="outline">
                  <span className="num">{dish.readyInMinutes}</span>&nbsp;min
                </Tag>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <Stepper
              icon={<ForkKnife size={15} weight="bold" />}
              label="On your plate"
              unit={plate === 1 ? 'serving' : 'servings'}
              value={plate}
              min={1}
              max={maxPlate}
              onChange={setPlate}
            />

            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              {macros.map((m) => (
                <div key={m.label} className="flex items-baseline gap-1.5">
                  <motion.span
                    key={`${m.label}-${m.value}`}
                    initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
                    className="num text-2xl text-ink"
                  >
                    {m.value}
                  </motion.span>
                  <span className="text-2xs text-ink-3">{m.label}</span>
                </div>
              ))}
            </div>
            <p className="text-2xs text-ink-3">
              {plate === 1
                ? 'One serving, as measured by the source.'
                : `${plate} servings of it, as measured by the source.`}
            </p>
          </div>

          {dish.sourceUrl && showsSourceLink(dish.provider) && (
            <a
              href={dish.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand"
            >
              The original recipe
              <ArrowUpRight size={14} weight="bold" />
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-10">
        {dish.ingredients && dish.ingredients.length > 0 && (
          <Ingredients
            items={dish.ingredients}
            factor={yieldsServings ? cooking / yieldsServings : 1}
            cooking={yieldsServings ? cooking : null}
            maxCooking={yieldsServings ? Math.min(24, yieldsServings * 3) : 1}
            onCookingChange={setBatch}
          />
        )}

        <section className="flex flex-col gap-3">
          <h2 className="border-b border-line pb-2 text-lg text-ink">Method</h2>
          {dish.directions && dish.directions.length > 0 ? (
            <RecipeFlow key={dish.id} steps={dish.directions} recipeId={dish.id} />
          ) : (
            <p className="text-sm text-ink-3">This one arrived without its steps.</p>
          )}
        </section>
      </div>

      <RecipeAttribution items={[dish]} />
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-ink"
    >
      <ArrowLeft size={15} weight="bold" />
      Today
    </Link>
  )
}

/** A stepper for one number, with the unit spelled out so it cannot be misread. */
function Stepper({
  icon,
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  icon: ReactNode
  label: string
  unit: string
  value: number
  min: number
  max: number
  onChange: (next: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-1.5 text-sm text-ink-3">
        {icon}
        {label}
      </span>
      <div className="flex items-center gap-1">
        <IconButton
          size="xs"
          variant="secondary"
          aria-label={`${label}: one ${unit.replace(/s$/, '')} fewer`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <Minus size={13} weight="bold" />
        </IconButton>
        <span className="num min-w-8 text-center text-lg text-ink">{value}</span>
        <IconButton
          size="xs"
          variant="secondary"
          aria-label={`${label}: one ${unit.replace(/s$/, '')} more`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          <Plus size={13} weight="bold" />
        </IconButton>
      </div>
    </div>
  )
}

/**
 * What to buy, for the batch you are actually cooking. The amounts are the
 * source's own, rewritten by `scaleIngredient`; a line with no number in it
 * ("Salt and pepper to taste") is left exactly as written. Ticking things off
 * as you gather them is the point of a shopping list.
 */
function Ingredients({
  items,
  factor,
  cooking,
  maxCooking,
  onCookingChange,
}: {
  items: string[]
  factor: number
  cooking: number | null
  maxCooking: number
  onCookingChange: (next: number) => void
}) {
  const reduceMotion = useReducedMotion()
  const [got, setGot] = useState<string[]>([])
  const lines = useMemo(() => items.map((item) => scaleIngredient(item, factor)), [items, factor])

  return (
    <section className="flex flex-col gap-3 lg:sticky lg:top-4">
      <h2 className="flex items-baseline justify-between gap-3 border-b border-line pb-2 text-lg text-ink">
        Ingredients
        <span className="num text-2xs text-ink-3">{items.length}</span>
      </h2>

      {cooking !== null && (
        <>
          <Stepper
            icon={<Users size={15} weight="bold" />}
            label="Cooking for"
            unit={cooking === 1 ? 'serving' : 'servings'}
            value={cooking}
            min={1}
            max={maxCooking}
            onChange={onCookingChange}
          />
          <p className="text-2xs text-ink-3">
            {factor === 1
              ? 'The amounts as the recipe is written.'
              : 'Amounts rewritten for this batch; lines without a measurement are unchanged.'}
          </p>
        </>
      )}

      <ul className="flex flex-col">
        {lines.map((line, i) => {
          const checked = got.includes(line)
          return (
            <motion.li
              key={items[i]}
              initial={reduceMotion ? false : { opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={reduceMotion ? { duration: 0 } : { delay: Math.min(i * 0.03, 0.3) }}
            >
              <button
                type="button"
                aria-pressed={checked}
                onClick={() =>
                  setGot((prev) => (checked ? prev.filter((x) => x !== line) : [...prev, line]))
                }
                className="flex w-full items-start gap-2.5 border-b border-line/60 py-2 text-left"
              >
                <span className={cnBox(checked)} aria-hidden>
                  {checked && <span className="size-1.5 rounded-full bg-surface" />}
                </span>
                <span
                  className={
                    checked
                      ? 'text-sm text-ink-3 line-through decoration-line'
                      : 'text-sm text-ink-2'
                  }
                >
                  {line}
                </span>
              </button>
            </motion.li>
          )
        })}
      </ul>
    </section>
  )
}

function cnBox(checked: boolean): string {
  return [
    'mt-1 flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150',
    checked ? 'border-transparent bg-ink' : 'border-line-strong bg-surface',
  ].join(' ')
}

function RecipeSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-8">
      <div className="h-5 w-20 rounded bg-surface-2" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="aspect-[4/3] w-full rounded-xl bg-surface-2" />
        <div className="flex flex-col gap-4 lg:pt-2">
          <div className="h-9 w-3/4 rounded bg-surface-2" />
          <div className="h-5 w-24 rounded bg-surface-2" />
          <div className="h-16 w-full rounded bg-surface-2" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-6 w-full rounded bg-surface-2" />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-12 w-full rounded-lg bg-surface-2" />
          ))}
        </div>
      </div>
    </div>
  )
}
