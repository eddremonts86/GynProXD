import { ART_DIR, type IntimateActivity } from '@/data/intimacy'
import { cn } from '@/lib/utils'

/**
 * Where the drawing goes, before there is a drawing.
 *
 * The frame is here, at the right shape, in the right place in the card, with
 * the alt text already a field on the entry — so the day the first illustration
 * lands it is a file in `public/intimacy/` and one line in `data/intimacy.ts`,
 * and nothing about this layout moves.
 *
 * Empty is drawn as an empty frame rather than as nothing, and the difference
 * matters both ways. Collapsing it would make the list reflow the day art
 * arrives, and reviewing a design whose main visual element is imaginary is how
 * you end up with a card that only works without pictures. A dashed edge and
 * one quiet line are what stop sixteen of them reading as sixteen failures;
 * `docs/intimacy-illustrations.md` is what they are waiting for.
 *
 * No stand-in artwork, ever. This product does not draw something approximate
 * and let a member assume it is the thing.
 */
export function IntimacyArt({
  activity,
  className,
}: {
  activity: IntimateActivity
  className?: string
}) {
  const frame = cn('w-full overflow-hidden rounded-md border sm:w-40 sm:shrink-0', className)

  if (activity.art) {
    return (
      <img
        src={`${ART_DIR}${activity.art.file}`}
        alt={activity.art.alt}
        loading="lazy"
        decoding="async"
        width={1200}
        height={900}
        className={cn(frame, 'aspect-[4/3] border-line bg-surface-2 object-cover')}
      />
    )
  }

  return (
    <div
      className={cn(
        frame,
        'flex aspect-[4/3] items-center justify-center border-dashed border-line bg-surface-2/60 px-3',
      )}
    >
      <span className="text-center text-2xs leading-snug text-ink-3">Illustration to come</span>
    </div>
  )
}
