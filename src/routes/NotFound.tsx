import { useNavigate } from '@tanstack/react-router'
import { Compass } from '@phosphor-icons/react'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { PageHeader } from '../ui/PageHeader'

/**
 * The branded dead end. TanStack's default is a bare "Not Found" string with
 * none of the shell's vocabulary; this at least tells you where you are and
 * gives you the two doors most people want.
 */
export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Nothing here" description="That address does not match any part of enForma." />
      <EmptyState
        icon={<Compass size={20} />}
        title="Lost page"
        description="The link may be stale, or the page may have moved. Your training data is untouched."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => navigate({ to: '/' })}>Go to Today</Button>
            <Button variant="secondary" onClick={() => navigate({ to: '/planner' })}>
              Open planner
            </Button>
          </div>
        }
      />
    </div>
  )
}
