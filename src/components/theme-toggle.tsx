import { Moon, Sun } from '@phosphor-icons/react'
import { IconButton } from '@/ui/Button'
import { useTheme } from '@/hooks/use-theme'

export function ThemeToggle({ size = 'sm' }: { size?: 'xs' | 'sm' | 'md' }) {
  const { theme, toggle } = useTheme()
  return (
    <IconButton
      size={size}
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </IconButton>
  )
}
