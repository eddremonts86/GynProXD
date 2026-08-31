import { Cloud, HardDrives, Lock } from '@phosphor-icons/react'
import { coachDestination } from '../lib/ai-plan'
import { cn } from '@/lib/utils'

/**
 * Where the sentence somebody just typed is about to be sent.
 *
 * This app's front page says "It runs on this device" and "nothing leaves this
 * device unless you turn on sync". Both are true of training data. Neither is
 * true of the intake: the whole prose goes into the coach's prompt, which is the
 * only channel able to carry an intention the form has no field for — and it is
 * also where somebody writes about a knee that hurts.
 *
 * A promise that is true of one thing and read as true of everything is a
 * promise doing damage. So this sits beside the box rather than in a footnote,
 * and it names the destination rather than gesturing at it: on a server that
 * calls a third party it says third party, in those words.
 *
 * The wording follows `coachDestination`, the same function that decides
 * whether to send — so pointing the base URL at something self-hosted changes
 * what a member is told, without anybody remembering to change a string, and
 * no build can promise privacy while its proxy calls a vendor.
 */
export function WhereWordsGo({ className }: { className?: string }) {
  const { coach, host } = coachDestination()

  /* No key on the server: the deterministic designer builds this, and nothing
     leaves. The one case where the front page's promise covers the intake too. */
  if (!coach) {
    return (
      <Line className={className} tone="quiet" icon={<Lock size={13} weight="bold" />}>
        No AI coach on this server, so nothing you write here is sent anywhere. The programme is
        built on this device from the numbers below.
      </Line>
    )
  }

  if (host === 'self') {
    return (
      <Line className={className} tone="quiet" icon={<HardDrives size={13} weight="bold" />}>
        What you write is sent to the model on enForma&rsquo;s own server so it can design the
        programme. It does not reach a third party, and it is not kept after the programme is built.
      </Line>
    )
  }

  /* `external`, and also the unknown case — a server too old to report where its
     coach runs is not a server anyone should be told is private. */
  return (
    <Line className={className} tone="loud" icon={<Cloud size={13} weight="bold" />}>
      <strong className="font-medium text-ink">
        What you write here is sent to an external AI provider
      </strong>{' '}
      so it can design the programme, along with your age, weight and goal. Health details go with
      it if you write them — an injury, a condition. Leave anything out that you would rather not
      send, and the rest of the plan still works.
    </Line>
  )
}

function Line({
  children,
  icon,
  tone,
  className,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  tone: 'quiet' | 'loud'
  className?: string
}) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-2xs leading-relaxed',
        tone === 'loud'
          ? 'border-line-strong bg-surface-2 text-ink-2'
          : 'border-dashed border-line text-ink-3',
        className,
      )}
    >
      <span className={cn('mt-px shrink-0', tone === 'loud' ? 'text-ink-2' : 'text-ink-3')}>
        {icon}
      </span>
      <span className="max-w-[64ch]">{children}</span>
    </p>
  )
}
