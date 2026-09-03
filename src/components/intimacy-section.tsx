import { useState } from 'react'
import { ArrowRight, Heart } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/ui/Button'
import { Panel } from '@/ui/Panel'
import { Switch } from '@/components/ui/switch'
import { forgetIntimacy, intimacyState, setIntimacyOn } from '@/lib/intimacy'
import { isBuilt } from '@/lib/member-plan'
import { useSession } from '@/store/useSession'

/**
 * The only switch for the intimate activity module, and the only way in.
 *
 * In Settings rather than on the module's own screen, because with the module
 * off there is no nav item and no day slot, so its screen is unreachable — and
 * because every other privacy control in this app is here, which is where
 * somebody reaches when they are about to hand the phone to a friend.
 *
 * Two states, and the difference is the point of having both:
 *
 *   off      not right now. The affirmation is remembered, so switching it
 *            back on is one tap.
 *   forget   as though it was never here, affirmation included.
 *
 * Nothing about this leaves the device. `lib/intimacy.ts` explains why it sits
 * in `localStorage` instead of the synced record every other preference uses.
 */
export function IntimacySection() {
  const navigate = useNavigate()
  const pro = useSession((s) => s.pro)
  const [state, setState] = useState(intimacyState)

  /* Not built means not offered. The card and the switch appear together or not
     at all, the same rule the gym plans have used since `isBuilt` existed. */
  if (!isBuilt('intimacy')) return null

  const refresh = () => setState(intimacyState())

  return (
    <Panel
      padding="lg"
      className="flex flex-col gap-4"
      role="region"
      aria-labelledby="intimacy-heading"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="intimacy-heading"
          className="flex items-center gap-2 text-base font-semibold text-ink"
        >
          <Heart size={18} />
          Intimate activity
        </h2>
        <p className="max-w-[62ch] text-sm text-ink-3">
          Arrangements described plainly, filtered by what your body is working around, and half an
          hour on your day when you want it. Nothing is recorded and nothing is counted. For adults.
        </p>
      </div>

      {!pro ? (
        <p className="max-w-[62ch] text-sm text-ink-3">
          Part of Pro. The subscription panel above says where this account stands.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="flex items-center gap-3 text-sm text-ink">
            <Switch
              aria-label="Show intimate activity"
              checked={state.on}
              onCheckedChange={(next) => {
                setIntimacyOn(next === true)
                refresh()
              }}
            />
            {state.on ? 'On, on this device' : 'Off'}
          </label>
          {state.affirmed && (
            <Button
              variant="dangerQuiet"
              size="sm"
              onClick={() => {
                forgetIntimacy()
                refresh()
              }}
            >
              Forget it on this device
            </Button>
          )}
        </div>
      )}

      {pro && !state.affirmed && (
        <p className="max-w-[62ch] text-2xs text-ink-3">
          Turning this on says you are over eighteen. It stays on this device only, so another
          device of yours will ask again.
        </p>
      )}

      {pro && state.on && (
        /* The reliable way in. The day carries a slot when there is half an
           hour free for one, and on a full day there would otherwise be no
           route to the screen at all. */
        <div>
          <Button variant="secondary" onClick={() => void navigate({ to: '/intimacy' })}>
            Open it
            <ArrowRight size={16} weight="bold" />
          </Button>
        </div>
      )}
    </Panel>
  )
}
