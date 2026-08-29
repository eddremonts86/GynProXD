import { useEffect, useMemo } from 'react'
import { useGym } from '../store/useGym'
import { useRecipes } from '../store/useRecipes'
import { nutritionTargetFor } from '../lib/nutrition-target'
import { Section } from '../ui/PageHeader'
import { Panel } from '../ui/Panel'
import { RecipeCard } from './recipe-card'
import { RecipeAttribution } from './recipe-attribution'
import type { OnboardingInput } from '../lib/types'

/**
 * Plates that fit the member's plan, from the same onboarding numbers that
 * pace it. The targets are computed locally; the dishes come from the recipe
 * search (or the bundled samples without a key); the AI coach only reorders
 * and annotates. Rendered on Today, under the session, where the plan lives.
 */
export function MealSuggestions() {
  const generatedPlans = useGym((s) => s.generatedPlans)
  const newest = useMemo(
    () => [...generatedPlans].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    [generatedPlans],
  )
  // No programme, no basis for food advice: the section simply is not there.
  if (!newest) return null
  return <Suggestions input={newest.input} />
}

function directionCopy(input: OnboardingInput): string {
  const t = nutritionTargetFor(input)
  const protein = `at least ${t.proteinG} g of protein`
  if (t.direction === 'deficit')
    return `About ${t.kcalTarget} kcal a day, ${Math.abs(t.deltaKcal)} below maintenance on the way to ${input.targetWeightKg} kg, with ${protein} to hold on to muscle.`
  if (t.direction === 'surplus')
    return `About ${t.kcalTarget} kcal a day, ${t.deltaKcal} above maintenance building toward ${input.targetWeightKg} kg, with ${protein} to feed it.`
  return `Around ${t.kcalTarget} kcal a day holds your weight, with ${protein} to support training.`
}

function Suggestions({ input }: { input: OnboardingInput }) {
  const suggestions = useRecipes((s) => s.suggestions)
  const loading = useRecipes((s) => s.loadingSuggestions)
  const ensureSuggestions = useRecipes((s) => s.ensureSuggestions)

  const target = useMemo(() => nutritionTargetFor(input), [input])

  useEffect(() => {
    void ensureSuggestions(input)
  }, [ensureSuggestions, input])

  const items = suggestions?.items ?? []

  return (
    <Section
      title="Eat for your plan"
      hint={`${target.kcalTarget} kcal · ${target.proteinG} g protein`}
    >
      <p className="max-w-[64ch] text-sm text-ink-3">
        {directionCopy(input)}
        {target.heightAssumed &&
          ' Height is assumed at 170 cm; add yours in Settings for a tighter number.'}
      </p>

      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {items.slice(0, 3).map((dish) => (
            <RecipeCard key={`${dish.provider}-${dish.id}`} dish={dish} />
          ))}
        </div>
      ) : (
        loading && (
          <Panel padding="lg">
            <p className="text-sm text-ink-3">Finding plates that fit your numbers…</p>
          </Panel>
        )
      )}

      {items.length > 0 && <RecipeAttribution items={items} />}
    </Section>
  )
}
