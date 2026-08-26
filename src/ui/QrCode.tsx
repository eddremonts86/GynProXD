import { useMemo } from 'react'
import { encode } from 'uqr'
import { cn } from '@/lib/utils'

/**
 * Theme-aware QR as inline SVG. Rendered dark-on-light in both themes —
 * scanners want contrast, not brand fidelity — on a white quiet zone.
 */
export function QrCode({
  value,
  className,
  label,
}: {
  value: string
  className?: string
  label?: string
}) {
  const { path, size } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 })
    let d = ''
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.data[y][x]) d += `M${x} ${y}h1v1h-1z`
      }
    }
    return { path: d, size: qr.size }
  }, [value])

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label ?? 'QR code'}
      className={cn('rounded-md bg-white', className)}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#141412" />
    </svg>
  )
}
