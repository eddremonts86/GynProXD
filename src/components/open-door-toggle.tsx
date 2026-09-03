import { useEffect, useState } from 'react'
import { Storefront } from '@phosphor-icons/react'
import { Panel } from '@/ui/Panel'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/ui/Input'
import { activeProfile, updateProfileMeta } from '@/lib/profiles'
import { currentArea, setArea, setOpenToGyms } from '@/lib/sync'
import { useSession } from '@/store/useSession'

/**
 * Whether gyms this person does not belong to may reach them.
 *
 * Shown only to somebody with no gym, because that is the only state in which
 * it decides anything — a control that does nothing is worse than an absent
 * one, and it reappears the day they leave a gym. The stored answer survives
 * either way, so leaving and rejoining does not quietly opt somebody back in.
 *
 * It defaults on, which is a decision and not an oversight. Nothing about this
 * person travels to a gym: the audience is a scope the server evaluates, so no
 * gym ever learns that any particular account has no gym, and none of them can
 * pick who receives one. What the switch governs is whether unsolicited
 * messages arrive at all — a notification preference rather than a disclosure.
 * Defaulting it off would have shipped a paid feature that reaches nobody,
 * which is a worse thing to sell than not building it.
 */
export function OpenDoorToggle() {
  const gym = useSession((s) => s.gym)
  const role = useSession((s) => s.role)
  const profile = activeProfile()
  const [open, setOpen] = useState(() => activeProfile()?.openToGyms !== false)
  const [area, setAreaValue] = useState('')
  const profileId = profile?.id ?? null

  /* Read back rather than assumed: it lives on the account, so another device
     may have set it and this one should show what the server will match on. */
  useEffect(() => {
    if (!profileId) return
    void currentArea(profileId).then(setAreaValue)
  }, [profileId])

  /* Operators have their own side of this in the Gym panel. */
  if (!profile || role === 'gym' || gym?.trim()) return null

  return (
    <Panel padding="lg" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Storefront size={16} className="text-ink-3" />
            Let gyms reach you
          </span>
          <span className="max-w-[56ch] text-2xs leading-relaxed text-ink-3">
            {open
              ? 'Gyms on enForma can send you an offer — at most one a month each. They are never told who you are, and nothing you train is ever part of it.'
              : 'Off. Gyms you have not joined cannot send you anything. enForma itself can still write to you.'}
          </span>
      </div>
      <Switch
        aria-label="Let gyms you have not joined send you offers"
        checked={open}
        onCheckedChange={(on) => {
          setOpen(on)
          updateProfileMeta(profile.id, { openToGyms: on })
          /* And on the server, where the read rule is. Local-only, a refusal
             would be honoured by this inbox and ignored by the thing deciding
             what to send it — the gym would be told it reached somebody who
             had said no. */
          void setOpenToGyms(profile.id, on)
        }}
      />
      </div>
      {/* Only while the door is open: a place to aim at means nothing to
          somebody nothing is aimed at, and offering the field anyway would ask
          for a fact we would then be holding for no reason. */}
      {open && (
        <div className="flex flex-col gap-1.5 border-t border-line pt-4">
          <Input
            id="open-door-area"
            label="Where you train (optional)"
            value={area}
            onChange={(e) => setAreaValue(e.target.value)}
            onBlur={() => void setArea(profile.id, area)}
            placeholder="A town or a postcode"
          />
          <span className="max-w-[62ch] text-2xs leading-relaxed text-ink-3">
            Leave it empty and you hear from gyms that are not aiming anywhere.
            Fill it in and you also hear from ones aiming at your place. A gym
            names a place; it is never told who is in it, or how many.
          </span>
        </div>
      )}
    </Panel>
  )
}
