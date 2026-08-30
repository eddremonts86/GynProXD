import { useMemo } from 'react'
import type { MessageImage } from '@/lib/messages'
import { bodyHtml, isEmptyHtml } from '@/lib/rich-text'
import { cn } from '@/lib/utils'

/**
 * The long half of a gym message: what it is, and what it looks like.
 *
 * The body used to render as a single `<p>`, so a gym that wrote three
 * paragraphs got one grey slab. It now carries formatting — bold, lists, a
 * link — which means it carries markup, which means it is sanitised on the way
 * out, on every render. Not once on the way in: a row can also arrive from the
 * sync server, and the only thing that account promised is that it belongs to
 * an operator.
 *
 * Bodies typed before formatting existed are plain text with blank lines, and
 * are converted rather than dumped: an old message keeps its paragraphs.
 */
export function MessageBody({ body, className }: { body: string; className?: string }) {
  const html = useMemo(() => bodyHtml(body), [body])
  if (isEmptyHtml(body)) return null
  return (
    <div
      className={cn('rich-text max-w-[68ch] text-sm leading-relaxed text-ink-2', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/**
 * Up to four pictures, laid out by how many there are rather than dropped into
 * one grid that suits none of them. A single photo earns the full width; three
 * take a 2fr lead and two stacked beside it, because three equal boxes in a
 * row is the one arrangement that makes every picture look like a thumbnail.
 *
 * Alt text is the gym's or nothing: an empty `alt` marks a picture as
 * decorative, which is the truthful answer when nobody described it, and
 * infinitely better than a filename read aloud.
 */
export function MessageGallery({
  images,
  className,
}: {
  images: MessageImage[]
  className?: string
}) {
  if (images.length === 0) return null
  const shown = images.slice(0, 4)

  if (shown.length === 1) {
    return (
      <figure className={cn('overflow-hidden rounded-xl bg-surface-2', className)}>
        <img
          src={shown[0].url}
          alt={shown[0].alt ?? ''}
          loading="lazy"
          className="aspect-[16/9] w-full object-cover"
        />
      </figure>
    )
  }

  if (shown.length === 3) {
    return (
      <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr]', className)}>
        <Shot image={shown[0]} className="col-span-2 aspect-[16/10] sm:col-span-1 sm:row-span-2 sm:aspect-auto sm:h-full" />
        <Shot image={shown[1]} className="aspect-square" />
        <Shot image={shown[2]} className="aspect-square" />
      </div>
    )
  }

  return (
    <div className={cn('grid grid-cols-2 gap-2', className)}>
      {shown.map((image, i) => (
        <Shot key={image.url + i} image={image} className="aspect-[4/3]" />
      ))}
    </div>
  )
}

function Shot({ image, className }: { image: MessageImage; className?: string }) {
  return (
    <figure className={cn('overflow-hidden rounded-xl bg-surface-2', className)}>
      <img
        src={image.url}
        alt={image.alt ?? ''}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    </figure>
  )
}
