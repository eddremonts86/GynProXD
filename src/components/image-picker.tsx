import { useEffect, useId, useRef, useState } from 'react'
import { ImageSquare, Plus, Trash, Warning } from '@phosphor-icons/react'
import {
  MAX_IMAGES,
  downscale,
  readableSize,
  rejectionFor,
  type PendingImage,
} from '@/lib/message-images'
import { IconButton } from '@/ui/Button'
import { cn } from '@/lib/utils'

/**
 * Pictures for the thing being sold.
 *
 * Deliberately not a media library: no folders, no reuse, no cropping. A gym
 * owner attaches the photo they just took of the plate, says what it shows,
 * and publishes. Everything past that is a CMS nobody asked for.
 *
 * The list is horizontal and the tiles are wide, because the caption under
 * each one is a real input and not a filename — alt text is the difference
 * between a picture and a picture a blind member can also buy from.
 */
export function ImagePicker({
  images,
  onChange,
  disabled,
  disabledReason,
}: {
  images: PendingImage[]
  onChange: (next: PendingImage[]) => void
  disabled?: boolean
  disabledReason?: string
}) {
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  /* Object URLs outlive the component unless someone hands them back, and by
     unmount the props are gone — so the live list is mirrored into a ref that
     the cleanup can still read. Written in an effect, never during render. */
  const urls = useRef<string[]>([])
  useEffect(() => {
    urls.current = images.map((i) => i.preview)
  }, [images])
  useEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url)
    },
    [],
  )

  const take = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setProblem(null)
    setBusy(true)
    const next = [...images]
    let refused: string | null = null
    for (const file of Array.from(files)) {
      const no = rejectionFor(file, next.length)
      if (no) {
        refused = no
        continue
      }
      const shrunk = await downscale(file)
      next.push({
        id: `${file.name}-${file.lastModified}-${next.length}`,
        file: shrunk,
        preview: URL.createObjectURL(shrunk),
        alt: '',
      })
    }
    setBusy(false)
    setProblem(refused)
    onChange(next)
    if (input.current) input.current.value = ''
  }

  const drop = (id: string) => {
    const going = images.find((i) => i.id === id)
    if (going) URL.revokeObjectURL(going.preview)
    onChange(images.filter((i) => i.id !== id))
    setProblem(null)
  }

  const setAlt = (id: string, alt: string) =>
    onChange(images.map((i) => (i.id === id ? { ...i, alt } : i)))

  const full = images.length >= MAX_IMAGES

  return (
    <div className="flex flex-col gap-2">
      <span className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-2xs font-medium text-ink-3">Pictures</span>
        <span className="num text-2xs text-ink-3">
          {images.length}/{MAX_IMAGES}
        </span>
      </span>

      {disabled ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-2xs text-ink-3">
          {disabledReason ?? 'Pictures need a sync account.'}
        </p>
      ) : (
        <>
          <input
            ref={input}
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={(e) => void take(e.target.files)}
          />

          {images.length > 0 && (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {images.map((image, index) => (
                <li
                  key={image.id}
                  className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-2.5"
                >
                  <div className="relative overflow-hidden rounded-lg bg-surface-2">
                    <img
                      src={image.preview}
                      alt=""
                      className="aspect-[16/10] w-full object-cover"
                    />
                    {index === 0 && (
                      <span className="absolute top-2 left-2 rounded-full bg-bg/85 px-2 py-0.5 text-[10px] font-medium text-ink backdrop-blur-sm">
                        Leads the card
                      </span>
                    )}
                    <span className="absolute top-1.5 right-1.5">
                      <IconButton
                        aria-label={`Remove picture ${index + 1}`}
                        onClick={() => drop(image.id)}
                      >
                        <Trash size={14} />
                      </IconButton>
                    </span>
                  </div>
                  <input
                    value={image.alt}
                    onChange={(e) => setAlt(image.id, e.target.value)}
                    placeholder="What is in the picture?"
                    aria-label={`Description of picture ${index + 1}`}
                    className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-2xs text-ink placeholder:text-ink-3 focus:border-line-strong focus:outline-none"
                  />
                  <span className="num text-[10px] text-ink-3">
                    {readableSize(image.file.size)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!full && (
            <label
              htmlFor={inputId}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                void take(e.dataTransfer.files)
              }}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors duration-150',
                dragging
                  ? 'border-ink-3 bg-surface-2'
                  : 'border-line hover:border-line-strong hover:bg-surface-2',
              )}
            >
              {busy ? (
                <>
                  {/* The work is a decode and a canvas draw, not a request:
                      a shimmer reads as "almost done", which it is. */}
                  <span className="h-4 w-28 animate-pulse rounded-full bg-line" />
                  <span className="text-2xs text-ink-3">Resizing…</span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    {images.length === 0 ? (
                      <ImageSquare size={17} weight="regular" />
                    ) : (
                      <Plus size={15} weight="bold" />
                    )}
                    {images.length === 0 ? 'Add pictures' : 'Add another'}
                  </span>
                  <span className="text-2xs text-ink-3">
                    Drag them here, or click. JPEG, PNG or WebP — resized for you.
                  </span>
                </>
              )}
            </label>
          )}

          {problem && (
            <p className="flex items-center gap-1.5 text-2xs text-danger">
              <Warning size={13} weight="fill" />
              {problem}
            </p>
          )}
        </>
      )}
    </div>
  )
}
