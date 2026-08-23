import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({ label, className = '', id, ...props }: InputProps) {
  const input = (
    <input
      id={id}
      className={[
        'w-full rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600',
        'transition-colors focus:border-accent focus:bg-surface-2',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      ].join(' ')}
      {...props}
    />
  )
  if (!label) return input
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
      {input}
    </label>
  )
}
