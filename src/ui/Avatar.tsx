import { cn } from '@/lib/utils'

/**
 * Initials monogram. Profiles are local and photo-less, so identity is a
 * generated mark: a tone picked deterministically from the profile id (stable
 * across renames) with the name's initials on top. Tones are fixed hexes,
 * verified at >= 4.5:1 against the chalk glyph in both themes.
 */
const TONES = ['#55703f', '#a8541f', '#3f6b76', '#8a5148', '#7d6427', '#4c4b45']

const SIZES = {
  sm: 'size-7 text-[10px]',
  md: 'size-9 text-xs',
  lg: 'size-12 text-sm',
} as const

function avatarTone(seed: string): string {
  /* FNV-1a: tiny, deterministic, spreads short ids well enough for 6 buckets. */
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return TONES[Math.abs(hash) % TONES.length]
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

interface AvatarProps {
  name: string
  /** Stable identifier for the tone; defaults to the name. */
  seed?: string
  size?: keyof typeof SIZES
  className?: string
}

export function Avatar({ name, seed, size = 'md', className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide text-[#f4f3ef] select-none',
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: avatarTone(seed ?? name) }}
    >
      {initialsOf(name)}
    </span>
  )
}
