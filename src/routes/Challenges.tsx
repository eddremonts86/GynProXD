import { useMemo } from 'react'
import { Trophy } from '@phosphor-icons/react'
import { useGym } from '../store/useGym'
import { useMessages } from '../store/useMessages'
import { useSession } from '../store/useSession'
import { inboxFor } from '../lib/messages'
import { repsForDay, totalReps, type Challenge } from '../lib/challenge'
import { exerciseById } from '../lib/exercises'
import { SAMPLE_CHALLENGES } from '../data/sample-challenges'
import { ChallengeCard } from '../components/challenge-card'
import { StoryTeaser } from './Story'
import { Button } from '../ui/Button'
import { ExerciseThumb } from '../ui/ExerciseThumb'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { PageHeader, Section } from '../ui/PageHeader'
import { EmptyState } from '../ui/EmptyState'
import { viewerFor } from '../lib/profiles'

/**
 * One movement, thirty days, a number per day. Progress is private to the
 * profile; definitions come bundled with the app or from the gym's bus.
 */
export function ChallengesPage() {
  const challenges = useGym((s) => s.challenges)
  const startChallenge = useGym((s) => s.startChallenge)
  const abandonChallenge = useGym((s) => s.abandonChallenge)
  const toggleChallengeDay = useGym((s) => s.toggleChallengeDay)

  const profileId = useSession((s) => s.profileId)
  const gym = useSession((s) => s.gym)
  const messages = useMessages((s) => s.messages)

  const activeIds = useMemo(() => new Set(challenges.map((c) => c.challenge.id)), [challenges])

  const gymChallenges = useMemo(() => {
    if (!profileId) return []
    return inboxFor(messages, viewerFor(profileId, gym))
      .filter((m) => m.kind === 'challenge' && m.challenge)
      .map((m) => ({ challenge: m.challenge!, from: m.gym }))
  }, [messages, profileId, gym])

  const available: { challenge: Challenge; from?: string }[] = [
    ...gymChallenges.filter((g) => !activeIds.has(g.challenge.id)),
    ...SAMPLE_CHALLENGES.filter((c) => !activeIds.has(c.id)).map((challenge) => ({ challenge })),
  ]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Challenges"
        description="One movement, thirty days, a number per day. Your progress stays on this profile."
      />

      <Section title="Programme" hint="A story, one day at a time">
        <StoryTeaser />
      </Section>

      {challenges.length === 0 ? (
        <EmptyState
          icon={<Trophy size={20} />}
          title="No active challenge"
          description="Pick one below. Day one starts the day you join."
        />
      ) : (
        <Section title="Active" hint={String(challenges.length)}>
          <div className="flex flex-col gap-4">
            {challenges.map((c) => (
              <ChallengeCard
                key={c.challenge.id}
                state={c}
                onToggleDay={(dateIso) => toggleChallengeDay(c.challenge.id, dateIso)}
                onLeave={() => abandonChallenge(c.challenge.id)}
              />
            ))}
          </div>
        </Section>
      )}

      {available.length > 0 && (
        <Section title="Available" hint={String(available.length)}>
          <ul className="grid gap-4 sm:grid-cols-2">
            {available.map(({ challenge, from }) => {
              const exercise = exerciseById(challenge.exerciseId)
              const last = repsForDay(challenge, challenge.days)
              return (
                <li key={challenge.id}>
                  <Panel padding="lg" className="flex h-full flex-col gap-3">
                    <div className="flex items-center gap-3">
                      {exercise && <ExerciseThumb exercise={exercise} size="md" />}
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-semibold text-ink">{challenge.name}</h3>
                        <p className="mt-0.5 text-2xs text-ink-3">
                          {exercise?.name ?? challenge.exerciseId}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Tag tone="outline">{challenge.days} days</Tag>
                      <Tag tone="outline">
                        {challenge.start} → {last} {challenge.unit}
                      </Tag>
                      <Tag tone="outline">
                        {totalReps(challenge).toLocaleString('en-GB')} total
                      </Tag>
                      {from && <Tag tone="brand">{from}</Tag>}
                    </div>
                    {challenge.blurb && (
                      <p className="text-sm leading-relaxed text-ink-3">{challenge.blurb}</p>
                    )}
                    <div className="mt-auto pt-1">
                      <Button variant="secondary" onClick={() => startChallenge(challenge)}>
                        Start challenge
                      </Button>
                    </div>
                  </Panel>
                </li>
              )
            })}
          </ul>
        </Section>
      )}
    </div>
  )
}
