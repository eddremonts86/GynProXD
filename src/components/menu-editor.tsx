import { useState } from 'react'
import { ForkKnife, Megaphone, Plus, Trash } from '@phosphor-icons/react'
import { useMenus } from '@/store/useMenus'
import { useMessages } from '@/store/useMessages'
import { menuFor, countItems } from '@/lib/menu'
import type { MenuSection } from '@/lib/menu'
import { BANNER_DURATIONS } from '@/lib/messages'
import { SAMPLE_MENU } from '@/data/sample-menu'
import { pluralize } from '@/lib/labels'
import { Button, IconButton } from '@/ui/Button'
import { Collapse } from '@/ui/Collapse'
import { FormSelect } from '@/ui/FormSelect'
import { Input } from '@/ui/Input'
import { Panel } from '@/ui/Panel'

/**
 * The gym's standing kitchen card, editable in place. Saving replaces the
 * whole menu; promoting publishes an announcement whose banner links to
 * /menu, which is how the kitchen reaches people who never open the inbox.
 */
export function MenuEditor({ gym, profileId }: { gym: string; profileId: string }) {
  const menus = useMenus((s) => s.menus)
  const setMenu = useMenus((s) => s.setMenu)
  const publish = useMessages((s) => s.publish)

  const saved = menuFor(menus, gym)
  const [sections, setSections] = useState<MenuSection[]>(
    () => saved?.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i })) })) ?? [],
  )
  const [feedback, setFeedback] = useState<string | null>(null)
  const [promoteMinutes, setPromoteMinutes] = useState('60')

  const patchSection = (index: number, patch: Partial<MenuSection>) =>
    setSections(sections.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  const patchItem = (si: number, ii: number, field: 'name' | 'desc' | 'price', value: string) =>
    setSections(
      sections.map((s, i) =>
        i === si
          ? { ...s, items: s.items.map((item, j) => (j === ii ? { ...item, [field]: value } : item)) }
          : s,
      ),
    )

  const hasContent = sections.some((s) => s.name.trim() && s.items.some((i) => i.name.trim()))

  const save = () => {
    setMenu(gym, sections)
    setFeedback('Menu saved.')
  }

  const promote = () => {
    const minutes = Number(promoteMinutes)
    publish({
      gym,
      authorId: profileId,
      kind: 'announcement',
      title: `The kitchen at ${gym} is open`,
      body: 'Fresh menu on the counter — shakes, bowls and bakes.',
      audience: 'all',
      banner: { minutes },
      link: 'menu',
    })
    setFeedback(
      `Menu promoted — banner up for ${BANNER_DURATIONS.find((d) => d.minutes === minutes)?.label.toLowerCase() ?? `${minutes} minutes`}.`,
    )
  }

  return (
    <Panel padding="lg" className="flex flex-col gap-4">
      {sections.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <ForkKnife size={22} className="text-ink-3" />
          <p className="max-w-[52ch] text-sm text-ink-3">
            No menu yet. Start from the sample card and make it yours, or build it section by
            section. Members browse it at any time; promote it when something is fresh.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setSections(SAMPLE_MENU.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i })) })))
                setFeedback(null)
              }}
            >
              Load the sample menu
            </Button>
            <Button
              variant="ghost"
              onClick={() => setSections([{ name: '', items: [{ name: '', desc: '', price: '' }] }])}
            >
              <Plus size={14} weight="bold" />
              Start empty
            </Button>
          </div>
        </div>
      ) : (
        <>
          {sections.map((section, si) => (
            <div key={si} className="rounded-lg bg-surface-2 p-3">
              <Collapse
                defaultOpen={!section.name.trim() || section.items.every((i) => !i.name.trim())}
                header={
                  <span className="flex items-baseline gap-2">
                    <span className="truncate">{section.name.trim() || 'New section'}</span>
                    <span className="num text-2xs font-normal text-ink-3">
                      {pluralize(section.items.filter((i) => i.name.trim()).length, 'item')}
                    </span>
                  </span>
                }
                headerExtras={
                  <IconButton
                    aria-label={`Remove section ${section.name || si + 1}`}
                    onClick={() => setSections(sections.filter((_, i) => i !== si))}
                  >
                    <Trash size={15} />
                  </IconButton>
                }
              >
                <div className="flex flex-col gap-2">
                  <Input
                    aria-label={`Section ${si + 1} name`}
                    value={section.name}
                    onChange={(e) => patchSection(si, { name: e.target.value })}
                    placeholder="Section — e.g. Post-workout shakes"
                    className="h-9 font-semibold"
                  />

                  {section.items.map((item, ii) => (
                <div key={ii} className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={`Item ${ii + 1} name in ${section.name || `section ${si + 1}`}`}
                    value={item.name}
                    onChange={(e) => patchItem(si, ii, 'name', e.target.value)}
                    placeholder="Dish"
                    className="h-9 min-w-[8rem] flex-1"
                  />
                  <Input
                    aria-label={`Item ${ii + 1} description in ${section.name || `section ${si + 1}`}`}
                    value={item.desc ?? ''}
                    onChange={(e) => patchItem(si, ii, 'desc', e.target.value)}
                    placeholder="Description (optional)"
                    className="h-9 min-w-[10rem] flex-[2]"
                  />
                  <Input
                    aria-label={`Item ${ii + 1} price in ${section.name || `section ${si + 1}`}`}
                    value={item.price ?? ''}
                    onChange={(e) => patchItem(si, ii, 'price', e.target.value)}
                    placeholder="75 kr"
                    className="h-9 w-24"
                  />
                  <IconButton
                    aria-label={`Remove item ${item.name || ii + 1}`}
                    onClick={() =>
                      patchSection(si, { items: section.items.filter((_, j) => j !== ii) })
                    }
                  >
                    <Trash size={14} />
                  </IconButton>
                </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() =>
                      patchSection(si, {
                        items: [...section.items, { name: '', desc: '', price: '' }],
                      })
                    }
                  >
                    <Plus size={13} weight="bold" />
                    Add item
                  </Button>
                </div>
              </Collapse>
            </div>
          ))}

          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => setSections([...sections, { name: '', items: [{ name: '', desc: '', price: '' }] }])}
          >
            <Plus size={14} weight="bold" />
            Add section
          </Button>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button variant="primary" onClick={save} disabled={!hasContent}>
              Save menu
            </Button>
            {saved && (
              <span className="flex flex-wrap items-center gap-2">
                <FormSelect
                  ariaLabel="Banner duration"
                  size="sm"
                  value={promoteMinutes}
                  onValueChange={setPromoteMinutes}
                  options={BANNER_DURATIONS.map((d) => ({ value: String(d.minutes), label: d.label }))}
                  className="w-32"
                />
                <Button variant="secondary" size="sm" onClick={promote}>
                  <Megaphone size={14} />
                  Promote as banner
                </Button>
              </span>
            )}
            {feedback && (
              <span role="status" className="text-2xs text-good">
                {feedback}
              </span>
            )}
          </div>
          {saved && (
            <p className="text-2xs text-ink-3">
              {pluralize(countItems(saved), 'item')} live at /menu for your members. Promoting
              publishes an announcement whose banner links straight to it.
            </p>
          )}
        </>
      )}
    </Panel>
  )
}
