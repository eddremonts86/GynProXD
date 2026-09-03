import { useState } from 'react'
import { Plus, Trash } from '@phosphor-icons/react'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { Panel } from '@/ui/Panel'
import { EmptyState } from '@/ui/EmptyState'
import { FormSelect } from '@/ui/FormSelect'
import { Tag } from '@/ui/Tag'
import { DayPicker } from '@/components/day-picker'
import { anchorProblems, MAX_LABEL, type Anchor, type AnchorKind } from '@/lib/life-profile'
import { DAY_LABELS } from '@/store/useGym'
import type { DayOfWeek } from '@/lib/types'

/**
 * The hours somebody does not control, entered by hand.
 *
 * This is the whole input to the day planner, which is why it is a form and not
 * a conversation: the fields are five, they are all obvious, and a language
 * model asking "and what time is the school run?" would be slower than a text
 * box. Phase 3's companion reads prose for the things a form cannot hold; this
 * holds the things a form holds better.
 *
 * `<input type="time">` rather than a picker component, and `DayPicker` rather
 * than a second one: the platform has both and neither needed writing.
 */

const KINDS: { value: AnchorKind; label: string }[] = [
  { value: 'work', label: 'Work' },
  { value: 'care', label: 'Looking after someone' },
  { value: 'travel', label: 'Travel' },
  { value: 'fixed', label: 'Something fixed' },
  { value: 'busy', label: 'Busy' },
]

const KIND_LABEL: Record<AnchorKind, string> = {
  work: 'Work',
  care: 'Care',
  travel: 'Travel',
  fixed: 'Fixed',
  busy: 'Busy',
}

type Draft = Omit<Anchor, 'id'> & { id?: string }

const BLANK: Draft = {
  label: '',
  days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  start: '09:00',
  end: '17:00',
  kind: 'work',
}

/** Weekday order, so "Fri, Mon" always reads "Mon, Fri". */
const WEEK: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function daysLabel(days: readonly DayOfWeek[]): string {
  const ordered = WEEK.filter((d) => days.includes(d))
  if (ordered.length === 7) return 'Every day'
  if (ordered.length === 5 && ordered.every((d) => d !== 'sat' && d !== 'sun')) return 'Weekdays'
  if (ordered.length === 2 && ordered[0] === 'sat' && ordered[1] === 'sun') return 'Weekends'
  return ordered.map((d) => DAY_LABELS[d]).join(', ')
}

export function AnchorEditor({
  anchors,
  onSave,
  onRemove,
}: {
  anchors: readonly Anchor[]
  onSave: (anchor: Anchor) => void
  onRemove: (id: string) => void
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  /* Problems are shown once somebody has tried to save, not while they type:
     a form that goes red before the first field is finished is a form that
     reads as broken. */
  const [tried, setTried] = useState(false)
  const problems = draft ? anchorProblems(draft) : []
  const errorFor = (field: 'label' | 'days' | 'start' | 'end') =>
    tried ? problems.find((p) => p.field === field)?.message : undefined

  const save = () => {
    if (!draft) return
    setTried(true)
    if (anchorProblems(draft).length > 0) return
    onSave({ ...draft, id: draft.id ?? `anchor-${Date.now().toString(36)}` } as Anchor)
    setDraft(null)
    setTried(false)
  }

  return (
    <div className="flex flex-col gap-3">
      {anchors.length === 0 && !draft && (
        <EmptyState
          title="Nothing fixed yet"
          description="Add the hours you do not choose: work, the commute, the school run. The day plan arranges everything else around them."
          action={
            <Button variant="primary" onClick={() => setDraft(BLANK)}>
              <Plus size={16} weight="bold" />
              Add fixed hours
            </Button>
          }
        />
      )}

      {anchors.length > 0 && (
        <Panel padding="none" className="divide-y divide-line">
          {anchors.map((anchor) => (
            <div key={anchor.id} className="flex items-center gap-3 p-3">
              <button
                type="button"
                onClick={() => {
                  setDraft({ ...anchor })
                  setTried(false)
                }}
                className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
              >
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="truncate text-sm font-medium text-ink">{anchor.label}</span>
                  <Tag tone="outline">{KIND_LABEL[anchor.kind]}</Tag>
                  {anchor.source === 'ics' && <Tag tone="neutral">From a calendar</Tag>}
                </span>
                <span className="num text-2xs text-ink-3">
                  {anchor.start} to {anchor.end} · {daysLabel(anchor.days)}
                </span>
              </button>
              <Button
                variant="dangerQuiet"
                size="sm"
                aria-label={`Remove ${anchor.label}`}
                onClick={() => onRemove(anchor.id)}
              >
                <Trash size={16} />
              </Button>
            </div>
          ))}
        </Panel>
      )}

      {draft ? (
        <Panel padding="lg" className="flex flex-col gap-4">
          <Input
            label="What is it"
            placeholder="work, school run, the commute"
            maxLength={MAX_LABEL}
            value={draft.label}
            error={errorFor('label')}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Starts"
              type="time"
              value={draft.start}
              error={errorFor('start')}
              onChange={(e) => setDraft({ ...draft, start: e.target.value })}
            />
            <Input
              label="Ends"
              type="time"
              value={draft.end}
              error={errorFor('end')}
              onChange={(e) => setDraft({ ...draft, end: e.target.value })}
            />
          </div>
          <FormSelect
            label="Kind"
            value={draft.kind}
            options={KINDS}
            onValueChange={(v) => setDraft({ ...draft, kind: v as AnchorKind })}
          />
          <div className="flex flex-col gap-1">
            <DayPicker
              value={draft.days}
              onChange={(days) => setDraft({ ...draft, days })}
            />
            {errorFor('days') && <p className="text-2xs text-danger">{errorFor('days')}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={save}>
              {draft.id ? 'Save changes' : 'Add it'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(null)
                setTried(false)
              }}
            >
              Cancel
            </Button>
          </div>
        </Panel>
      ) : (
        anchors.length > 0 && (
          <div>
            <Button variant="secondary" onClick={() => setDraft(BLANK)}>
              <Plus size={16} weight="bold" />
              Add more fixed hours
            </Button>
          </div>
        )
      )}
    </div>
  )
}
