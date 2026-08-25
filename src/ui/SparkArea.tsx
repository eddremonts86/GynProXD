import { useId } from 'react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

interface SparkAreaProps {
  data: { value: number }[]
  /** CSS color, defaults to the neutral chart tone. */
  color?: string
  className?: string
}

/**
 * A quiet trend line under a stat: no axes, no tooltip, no interaction.
 * Hidden entirely below two points, because one point is not a trend.
 */
export function SparkArea({ data, color = 'var(--chart-3)', className }: SparkAreaProps) {
  const id = useId()
  if (data.length < 2) return null
  return (
    <div className={cn('h-9 w-full', className)} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${id})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
