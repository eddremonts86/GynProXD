import type { ReactNode } from 'react'
import { Lock } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { EmptyState } from '@/ui/EmptyState'
import { Button } from '@/ui/Button'
import { isBuilt, proAllows, type ProFeature } from '@/lib/member-plan'
import { useSession } from '@/store/useSession'

/**
 * The one place a paid surface asks whether it may draw itself.
 *
 * `proAllows` is the gate and it is tested; this is the sentence that goes with
 * each way of being refused, and there are two of those for one reason: they
 * are not the same news. A feature that is not finished is our problem, and
 * saying "upgrade" in front of it would be selling something that does not
 * exist. A feature that is finished and unpaid is a choice somebody has not
 * made yet.
 *
 * Nothing here is a security boundary and it does not pretend to be one. The
 * session flag comes from `lib/entitlement`, which anybody can forge in
 * localStorage; the gate that costs money is on the server, on the routes that
 * spend it. What a forged flag buys is a look at a screen.
 */
export function ProGate({ feature, children }: { feature: ProFeature; children: ReactNode }) {
  const pro = useSession((s) => s.pro)
  const navigate = useNavigate()
  if (proAllows(pro, feature)) return <>{children}</>

  if (!isBuilt(feature)) {
    return (
      <EmptyState
        title="Not ready yet"
        description="This is on the list and it is not finished. Nothing to pay for until it is."
      />
    )
  }

  return (
    <EmptyState
      icon={<Lock size={20} />}
      title="Part of Pro"
      description="Your subscription covers this. Settings shows where this account stands and how to check again."
      action={
        <Button variant="secondary" onClick={() => void navigate({ to: '/settings' })}>
          Open Settings
        </Button>
      }
    />
  )
}
