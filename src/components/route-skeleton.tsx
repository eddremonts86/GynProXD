function Bar({ className }: { className: string }) {
  return <div className={`rounded-md bg-surface-2 ${className}`} />
}

/** Mirrors the real page rhythm: header, stat row, then two stacked panels. */
export function RouteFallback() {
  return (
    <div className="flex animate-pulse flex-col gap-8" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-2.5">
        <Bar className="h-8 w-52" />
        <Bar className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Bar className="h-20" />
        <Bar className="h-20" />
        <Bar className="h-20" />
        <Bar className="h-20" />
      </div>
      <Bar className="h-56 w-full" />
      <Bar className="h-40 w-full" />
      <span className="sr-only">Loading</span>
    </div>
  )
}
