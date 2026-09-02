import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowUUpLeft,
  Highlighter,
  Link as LinkIcon,
  LinkBreak,
  ListBullets,
  ListNumbers,
  Minus,
  Quotes,
  TextB,
  TextItalic,
  TextStrikethrough,
  TextSubscript,
  TextSuperscript,
  TextUnderline,
} from '@phosphor-icons/react'
import { isEmptyHtml, sanitizeHtml } from '@/lib/rich-text'
import { FormSelect } from '@/ui/FormSelect'
import { cn } from '@/lib/utils'

/**
 * A small formatting surface, not an editor suite.
 *
 * A gym owner writing about a clip card needs bold, a list, a heading and a
 * link. They do not need colours or a font picker, and every one of those is
 * another shape the member's card has to survive. The toolbar is the allowlist
 * made visible: if it is not here, it cannot be in the body.
 *
 * `contenteditable` is uncontrolled on purpose. Rewriting `innerHTML` from
 * React state on every keystroke destroys the selection and the composition
 * buffer — accented characters and every IME break. So React seeds it once and
 * then only reads.
 */

/**
 * Levels, named for what they look like rather than what they are.
 *
 * The tags start at `h4` because the card around this body already renders the
 * message title as an `h3`; a body opening with `h1` would leave the page's
 * outline out of order for anyone moving through it by headings. The operator
 * never has to know that — they see three sizes and a way back to normal text,
 * which is the whole of it.
 */
const BLOCKS = [
  { value: 'p', label: 'Normal text' },
  { value: 'h4', label: 'Heading' },
  { value: 'h5', label: 'Subheading' },
  { value: 'h6', label: 'Small heading' },
  { value: 'blockquote', label: 'Quote' },
] as const

/** Emphasis, in the order a hand reaches for it. */
const INLINE = [
  { command: 'bold', label: 'Bold', icon: <TextB size={15} weight="bold" /> },
  { command: 'italic', label: 'Italic', icon: <TextItalic size={15} weight="bold" /> },
  /* Underline reads as a link on the web, which is why it is not first — but a
     gym asking for it and finding nothing is worse than the ambiguity. */
  { command: 'underline', label: 'Underline', icon: <TextUnderline size={15} weight="bold" /> },
  {
    command: 'strikeThrough',
    label: 'Strikethrough',
    icon: <TextStrikethrough size={15} weight="bold" />,
  },
  {
    command: 'superscript',
    label: 'Superscript',
    icon: <TextSuperscript size={15} weight="bold" />,
  },
  { command: 'subscript', label: 'Subscript', icon: <TextSubscript size={15} weight="bold" /> },
] as const

const LISTS = [
  {
    command: 'insertUnorderedList',
    label: 'Bulleted list',
    icon: <ListBullets size={15} weight="bold" />,
  },
  {
    command: 'insertOrderedList',
    label: 'Numbered list',
    icon: <ListNumbers size={15} weight="bold" />,
  },
] as const

export function RichTextEditor({
  id,
  labelledBy,
  value,
  onChange,
  placeholder,
  minRows = 7,
}: {
  id: string
  /**
   * The id of the element that names this field. Required because what it
   * renders is a `contenteditable` div, not a form control: a `<label for>`
   * points at nothing here, so an accessibility sweep reads an unnamed text
   * box, which is what a screen reader was reading at the gym desk.
   */
  labelledBy: string
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minRows?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const [empty, setEmpty] = useState(() => isEmptyHtml(value))
  const [active, setActive] = useState<string[]>([])
  const [block, setBlock] = useState('p')
  const [highlighted, setHighlighted] = useState(false)

  /**
   * Seeded once, and again whenever the value is replaced from outside —
   * publishing clears the composer, and the editor has to follow.
   *
   * "From outside" is decided by comparing against what this editor last
   * emitted, not by whether it has focus. Guarding on focus looks equivalent
   * and is not: a reset that lands while the caret is still in the box is
   * exactly the case that matters, and it was being skipped, leaving the
   * published text sitting in a composer that believed it was empty.
   */
  const lastEmitted = useRef(value)
  useEffect(() => {
    const el = box.current
    if (!el || value === lastEmitted.current) return
    el.innerHTML = value
    lastEmitted.current = value
    setEmpty(isEmptyHtml(value))
  }, [value])

  /**
   * What the caret is sitting in.
   *
   * Without this the toolbar is write-only: every button looks the same
   * whether or not it is already on, and the heading control has no idea a
   * line is already a heading — which is why pressing it twice used to leave
   * the line stuck as one, with no way back to a paragraph.
   */
  const readSelection = useCallback(() => {
    const el = box.current
    if (!el || !el.contains(document.getSelection()?.anchorNode ?? null)) return
    const on: string[] = []
    for (const { command } of [...INLINE, ...LISTS]) {
      try {
        if (document.queryCommandState(command)) on.push(command)
      } catch {
        /* Some engines throw for an unsupported command; it simply reads off. */
      }
    }
    setActive(on)
    let current = ''
    try {
      current = document.queryCommandValue('formatBlock').toLowerCase()
    } catch {
      current = ''
    }
    /* Engines answer with `div`, an empty string or the tag; anything that is
       not one of ours is a plain paragraph as far as this control goes. */
    setBlock(BLOCKS.some((b) => b.value === current) ? current : 'p')

    /* `queryCommandState` knows nothing about `mark`, so the caret's ancestry
       is what answers it. */
    const anchor = document.getSelection()?.anchorNode ?? null
    const node = anchor?.nodeType === 1 ? (anchor as Element) : (anchor?.parentElement ?? null)
    setHighlighted(!!node?.closest('mark') && el.contains(node))
  }, [])

  useEffect(() => {
    document.addEventListener('selectionchange', readSelection)
    return () => document.removeEventListener('selectionchange', readSelection)
  }, [readSelection])

  const read = () => {
    const el = box.current
    if (!el) return
    /* Sanitised here as well as at render: it keeps what is stored clean, so
       an old row cannot be the only thing standing between a member and a
       script tag if a future renderer ever forgets. */
    const html = sanitizeHtml(el.innerHTML)
    setEmpty(isEmptyHtml(html))
    lastEmitted.current = html
    onChange(html)
    readSelection()
  }

  const exec = (command: string, argument?: string) => {
    box.current?.focus()
    /* `execCommand` is deprecated and universally implemented. The alternative
       is a selection-model editor, which is a library, and a library here is
       200 kB to make a gym owner's paragraph bold. */
    document.execCommand(command, false, argument)
    read()
  }

  /* Some engines only recognise the angle-bracket form. Passing it that way
     works in all of them. */
  const setBlockTo = (tag: string) => exec('formatBlock', `<${tag}>`)

  /**
   * Highlight has no `execCommand`, and the one that comes closest —
   * `hiliteColor` — writes an inline style, which the sanitiser drops on the
   * way out. So the tag is wrapped round the selection directly, and pressing
   * it again inside an existing mark unwraps that mark: without the second
   * half it would be paint that never comes off.
   */
  const toggleHighlight = () => {
    const el = box.current
    if (!el) return
    el.focus()
    const selection = document.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const anchor = selection.anchorNode
    const inside =
      anchor instanceof Node
        ? ((anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement)?.closest('mark') ??
          null)
        : null

    if (inside && el.contains(inside)) {
      const parent = inside.parentNode
      if (parent) {
        while (inside.firstChild) parent.insertBefore(inside.firstChild, inside)
        parent.removeChild(inside)
        parent.normalize()
      }
      read()
      return
    }

    const range = selection.getRangeAt(0)
    if (range.collapsed) return
    const mark = document.createElement('mark')
    try {
      range.surroundContents(mark)
    } catch {
      /* The selection crossed an element boundary, which `surroundContents`
         refuses; extracting and re-inserting handles it. */
      mark.appendChild(range.extractContents())
      range.insertNode(mark)
    }
    selection.removeAllRanges()
    read()
  }

  const addLink = () => {
    const url = window.prompt('Link to where?')
    if (!url) return
    const trimmed = url.trim()
    const href = /^(https?:|mailto:|tel:)/i.test(trimmed) ? trimmed : `https://${trimmed}`
    exec('createLink', href)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface-2 p-1">
        {/* A control that shows the block it is in, rather than a button that
            only ever pushes one way. Choosing "Normal text" is the way back. */}
        <FormSelect
          ariaLabel="Text style"
          size="sm"
          value={block}
          onValueChange={setBlockTo}
          options={BLOCKS.map((b) => ({ value: b.value, label: b.label }))}
          className="h-7 w-[9.25rem] border-none bg-transparent text-2xs hover:bg-line"
        />

        <span className="mx-0.5 h-4 w-px bg-line" />

        {INLINE.map(({ command, label, icon }) => (
          <ToolButton
            key={command}
            label={label}
            on={active.includes(command)}
            onPress={() => exec(command)}
          >
            {icon}
          </ToolButton>
        ))}
        <ToolButton label="Highlight" on={highlighted} onPress={toggleHighlight}>
          <Highlighter size={15} weight="bold" />
        </ToolButton>

        <span className="mx-0.5 h-4 w-px bg-line" />

        {LISTS.map(({ command, label, icon }) => (
          <ToolButton
            key={command}
            label={label}
            on={active.includes(command)}
            onPress={() => exec(command)}
          >
            {icon}
          </ToolButton>
        ))}
        <ToolButton
          label="Quote"
          on={block === 'blockquote'}
          onPress={() => setBlockTo('blockquote')}
        >
          <Quotes size={15} weight="bold" />
        </ToolButton>
        <ToolButton label="Divider" onPress={() => exec('insertHorizontalRule')}>
          <Minus size={15} weight="bold" />
        </ToolButton>

        <span className="mx-0.5 h-4 w-px bg-line" />

        <ToolButton label="Add a link" onPress={addLink}>
          <LinkIcon size={15} weight="bold" />
        </ToolButton>
        <ToolButton label="Remove link" onPress={() => exec('unlink')}>
          <LinkBreak size={15} weight="bold" />
        </ToolButton>
        <ToolButton label="Clear formatting" onPress={() => exec('removeFormat')}>
          <ArrowUUpLeft size={15} weight="bold" />
        </ToolButton>
      </div>

      <div className="relative">
        {empty && placeholder && (
          <p
            aria-hidden
            className="pointer-events-none absolute inset-0 px-3 py-2.5 text-sm leading-relaxed whitespace-pre-line text-ink-3"
          >
            {placeholder}
          </p>
        )}
        <div
          id={id}
          ref={box}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-labelledby={labelledBy}
          onInput={read}
          onBlur={read}
          onKeyUp={readSelection}
          onMouseUp={readSelection}
          /* Paste arrives as whatever the source page was made of; taking the
             plain text is the only way to be sure the toolbar is the allowlist. */
          onPaste={(e) => {
            e.preventDefault()
            const text = e.clipboardData.getData('text/plain')
            document.execCommand('insertText', false, text)
            read()
          }}
          style={{ minHeight: `${minRows * 1.5 + 1.25}rem` }}
          className={cn(
            'rich-body w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink',
            'focus:border-line-strong focus:outline-none',
          )}
        />
      </div>
    </div>
  )
}

function ToolButton({
  label,
  on,
  onPress,
  children,
}: {
  label: string
  on?: boolean
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={label}
      /* The mousedown is what would move the caret out of the text before the
         command ran; taking it here keeps the selection where the user left it. */
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className={cn(
        'flex size-7 items-center justify-center rounded-md transition-colors duration-150 active:scale-[0.94]',
        on ? 'bg-ink text-bg' : 'text-ink-2 hover:bg-line hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
