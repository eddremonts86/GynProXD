import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
import { CookingPot, MagnifyingGlass, WarningCircle, X } from '@phosphor-icons/react'
import {
  catalogueQuery,
  fetchCatalogue,
  type CatalogueQuery,
  type RecipeSuggestion,
} from '../lib/recipes'
import { PageHeader } from '../ui/PageHeader'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { Button, IconButton } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { cn } from '@/lib/utils'

/**
 * The whole catalogue, searchable. Filtering happens on the server because the
 * collection is far larger than a phone should download, and the query is
 * debounced so typing costs one request, not one per keystroke.
 *
 * The grid stays a plain responsive grid on purpose: this is a place to find a
 * dish among hundreds, and scanning beats composition here.
 */

const CATEGORIES = [
  { key: '', label: 'Everything' },
  { key: 'main', label: 'Mains' },
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'salad', label: 'Salads' },
  { key: 'soup', label: 'Soups' },
  { key: 'side', label: 'Sides' },
  { key: 'dessert', label: 'Sweet' },
  { key: 'drink', label: 'Drinks' },
] as const

const SORTS = [
  { key: 'name', label: 'A to Z' },
  { key: 'protein', label: 'Most protein' },
  { key: 'light', label: 'Lightest' },
  { key: 'quick', label: 'Quickest' },
] as const

type Sort = (typeof SORTS)[number]['key']

const HIGH_PROTEIN_G = 25
const LIGHT_KCAL = 300

export function RecipesPage() {
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<Sort>('name')
  const [highProtein, setHighProtein] = useState(false)
  const [light, setLight] = useState(false)

  /* One record of what is on screen, tagged with the query that produced it,
     so "loading" is derived rather than a flag kept in step by hand — and the
     fetching effect sets nothing synchronously. */
  const [result, setResult] = useState<{
    key: string
    items: RecipeSuggestion[]
    page: number
    hasMore: boolean
    total: number | null
  } | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [retry, setRetry] = useState(0)

  /* One request per pause in typing, not one per keystroke. */
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [term])

  const query: CatalogueQuery = useMemo(
    () => ({
      q: debounced || undefined,
      category: category || undefined,
      minProtein: highProtein ? HIGH_PROTEIN_G : undefined,
      maxKcal: light ? LIGHT_KCAL : undefined,
      sort,
    }),
    [debounced, category, highProtein, light, sort],
  )
  const key = useMemo(() => catalogueQuery(query), [query])

  /* A later filter must never be overwritten by an earlier reply. */
  const requestId = useRef(0)

  useEffect(() => {
    const id = ++requestId.current
    void fetchCatalogue(query).then((fetched) => {
      if (id !== requestId.current) return
      if (!fetched) {
        setFailedKey(key)
        return
      }
      setResult({
        key,
        items: fetched.items,
        page: 0,
        hasMore: fetched.hasMore,
        total: fetched.total,
      })
    })
  }, [query, key, retry])

  const fresh = result !== null && result.key === key
  const items = fresh ? result.items : []
  const hasMore = fresh ? result.hasMore : false
  const total = result?.total ?? null
  const state: 'loading' | 'ready' | 'failed' = fresh
    ? 'ready'
    : failedKey === key
      ? 'failed'
      : 'loading'

  const loadMore = useCallback(() => {
    if (!result || result.key !== key) return
    const next = result.page + 1
    const id = requestId.current
    setLoadingMore(true)
    void fetchCatalogue({ ...query, page: next })
      .then((fetched) => {
        if (id !== requestId.current || !fetched) return
        setResult((prev) =>
          prev && prev.key === key
            ? {
                ...prev,
                items: [...prev.items, ...fetched.items],
                page: next,
                hasMore: fetched.hasMore,
              }
            : prev,
        )
      })
      .finally(() => setLoadingMore(false))
  }, [key, query, result])

  const filtered = debounced !== '' || category !== '' || highProtein || light
  const clearAll = () => {
    setTerm('')
    setCategory('')
    setHighProtein(false)
    setLight(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Recipes"
        description="Every plate in the catalogue, with its method and the numbers that matter. Search by name, or narrow it down to what fits your day."
      />

      <div className="flex flex-col gap-3">
        <label className="relative block">
          <span className="sr-only">Search recipes by name</span>
          <MagnifyingGlass
            size={16}
            weight="bold"
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3"
          />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Chicken, lentils, oatmeal…"
            className="w-full rounded-lg border border-line bg-surface py-2.5 pr-10 pl-10 text-base text-ink shadow-[var(--shadow-panel)] transition-colors placeholder:text-ink-3 focus:border-line-strong focus:outline-none"
          />
          {term !== '' && (
            <span className="absolute top-1/2 right-2 -translate-y-1/2">
              <IconButton size="xs" variant="ghost" aria-label="Clear search" onClick={() => setTerm('')}>
                <X size={13} weight="bold" />
              </IconButton>
            </span>
          )}
        </label>

        {/* Chips scroll sideways on a phone rather than wrapping into a wall. */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {CATEGORIES.map((c) => (
            <Chip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)}>
              {c.label}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={highProtein} onClick={() => setHighProtein((v) => !v)}>
            {HIGH_PROTEIN_G}g protein or more
          </Chip>
          <Chip active={light} onClick={() => setLight((v) => !v)}>
            Under {LIGHT_KCAL} kcal
          </Chip>
          <span className="mx-1 h-4 w-px bg-line" aria-hidden />
          {SORTS.map((s) => (
            <Chip key={s.key} active={sort === s.key} onClick={() => setSort(s.key)}>
              {s.label}
            </Chip>
          ))}
        </div>

        <p className="flex items-center gap-2 text-2xs text-ink-3">
          {state === 'ready' && (
            <>
              <span className="num">{items.length}</span>
              {hasMore ? ' shown' : filtered ? ' found' : ' recipes'}
              {!filtered && total !== null && (
                <>
                  {' of '}
                  <span className="num">{total}</span>
                </>
              )}
            </>
          )}
          {filtered && state === 'ready' && (
            <button type="button" onClick={clearAll} className="underline underline-offset-2">
              Clear filters
            </button>
          )}
        </p>
      </div>

      {state === 'failed' ? (
        <EmptyState
          icon={<WarningCircle size={20} />}
          title="The catalogue did not answer"
          description="The sync server is where the recipes live. Check the connection and try again."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFailedKey(null)
                setRetry((n) => n + 1)
              }}
            >
              Try again
            </Button>
          }
        />
      ) : state === 'loading' ? (
        <SkeletonGrid />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<CookingPot size={20} />}
          title="Nothing matches that"
          description="Try a shorter word, another category, or drop one of the filters."
          action={
            <Button variant="secondary" size="sm" onClick={clearAll}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
            {items.map((dish, i) => (
              <CatalogueCard key={dish.id} dish={dish} index={i} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-1">
              <Button variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Show more'}
              </Button>
            </div>
          )}
        </>
      )}

      <p className="text-2xs text-ink-3">
        Recipes, photos and nutrition from USDA MyPlate (public domain).
      </p>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 rounded-full px-3 py-1.5 text-2xs font-medium transition-colors duration-150 active:scale-[0.97]',
        active
          ? 'bg-brand text-brand-ink'
          : 'border border-line text-ink-3 hover:border-line-strong hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

function CatalogueCard({ dish, index }: { dish: RecipeSuggestion; index: number }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { delay: Math.min((index % 24) * 0.02, 0.3), type: 'spring', stiffness: 160, damping: 22 }
      }
    >
      <Link to="/recipe/$id" params={{ id: dish.id }} className="group block h-full">
        <Panel padding="none" className="flex h-full flex-col overflow-hidden transition-shadow duration-150 group-hover:shadow-[var(--shadow-tile)]">
          <div className="overflow-hidden">
            <img
              src={dish.imageUrl}
              alt={dish.title}
              loading="lazy"
              className="aspect-[4/3] w-full bg-surface-2 object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          </div>
          <div className="flex flex-1 flex-col gap-2 p-3">
            <h3 className="line-clamp-2 text-sm leading-snug font-medium text-ink">{dish.title}</h3>
            <div className="mt-auto flex flex-wrap gap-1">
              {dish.kcal !== undefined && (
                <Tag>
                  <span className="num">{dish.kcal}</span>&nbsp;kcal
                </Tag>
              )}
              {dish.proteinG !== undefined && (
                <Tag tone="brand">
                  <span className="num">{dish.proteinG}</span>&nbsp;g
                </Tag>
              )}
            </div>
          </div>
        </Panel>
      </Link>
    </motion.div>
  )
}

function SkeletonGrid() {
  return (
    <div className="grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="aspect-[4/3] w-full rounded-xl bg-surface-2" />
          <div className="h-4 w-4/5 rounded bg-surface-2" />
          <div className="h-4 w-1/2 rounded bg-surface-2" />
        </div>
      ))}
    </div>
  )
}
