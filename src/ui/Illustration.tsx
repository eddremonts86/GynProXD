interface IllustrationProps {
  variant?: 'hero' | 'orb' | 'plate'
  className?: string
}

export function Illustration({ variant = 'hero', className = '' }: IllustrationProps) {
  if (variant === 'orb') {
    return (
      <div className={['relative overflow-hidden rounded-[var(--radius-xl)] bg-card border border-line', className].join(' ')}>
        <div className="absolute -top-6 -right-6 h-28 w-28 rounded-full bg-gradient-to-br from-accent/40 to-accent/5 blur-[18px]" />
        <div className="absolute -bottom-8 -left-8 h-20 w-20 rounded-full bg-gradient-to-br from-[#E8E0D8]/10 to-transparent blur-[12px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface/10" />
      </div>
    )
  }
  if (variant === 'plate') {
    return (
      <div className={['relative flex items-center justify-center overflow-hidden rounded-[var(--radius-lg)] bg-surface-2 border border-line', className].join(' ')}>
        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-accent via-accent/80 to-[#8B5E2E] shadow-[0_8px_24px_rgba(0,0,0,0.35),inset_0_1px_8px_rgba(255,255,255,0.15)] border border-white/10" />
        <div className="absolute inset-0 bg-gradient-to-tr from-accent/5 via-transparent to-white/[0.04]" />
      </div>
    )
  }
  return (
    <div className={['relative overflow-hidden rounded-[var(--radius-xl)] border border-line bg-card', className].join(' ')}>
      <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.08] via-transparent to-transparent" />
      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-gradient-to-br from-accent/30 to-accent/0 blur-[24px]" />
      <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-gradient-to-tr from-[#3A3632] to-transparent blur-[20px]" />
      <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-accent to-[#8B5E2E] shadow-[0_12px_32px_rgba(217,142,63,0.35),inset_0_1px_12px_rgba(255,255,255,0.2)] border border-white/10" />
      <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" style={{ transform: 'translate(-50%, -50%) rotate(12deg) scale(1.15)' }} />
      <div className="absolute inset-0 rounded-[inherit] border border-white/[0.04]" />
    </div>
  )
}
