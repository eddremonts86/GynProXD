import { useEffect, useRef, useState } from 'react'
import {
  ArrowUUpLeft,
  Link as LinkIcon,
  ListBullets,
  ListNumbers,
  Quotes,
  TextB,
  TextHOne,
  TextItalic,
  TextStrikethrough,
} from '@phosphor-icons/react'
import { isEmptyHtml, sanitizeHtml } from '@/lib/rich-text'
import { cn } from '@/lib/utils'

/**
 * A small formatting surface, not an editor suite.
 *
 * A gym owner writing about a clip card needs bold, a list and a link. They do
 * not need headings, tables, colours or a font picker, and every one of those
 * is another shape the member's card has to survive. The toolbar is the
 * allowlist made visible: if it is not a button here, it cannot be in the body.
 *
 * `contenteditable` is uncontrolled on purpose. Rewriting `innerHTML` from
 * React state on every keystroke destroys the selection and the composition
 * buffer — accented characters and every IME break. So React seeds it once and
 * then only reads.
 */

interface Command {
  id: string
  label: string
  icon: React.ReactNode
  run: (exec: (command: string, value?: string) => void) => void
}

const COMMANDS: Command[] = [
  { id: 'bold', label: 'Bold', icon: <TextB size={15} weight="bold" />, run: (x) => x('bold') },
  { id: 'italic', label: 'Italic', icon: <TextItalic size={15} weight="bold" />, run: (x) => x('italic') },
  {
    id: 'strikeThrough',
    label: 'Strikethrough',
    icon: <TextStrikethrough size={15} weight="bold" />,
    run: (x) => x('strikeThrough'),
  },
  {
    id: 'formatBlock:h4',
    label: 'Subheading',
    icon: <TextHOne size={15} weight="bold" />,
    run: (x) => x('formatBlock', 'h4'),
  },
  {
    id: 'insertUnorderedList',
    label: 'Bulleted list',
    icon: <ListBullets size={15} weight="bold" />,
    run: (x) => x('insertUnorderedList'),
  },
  {
    id: 'insertOrderedList',
    label: 'Numbered list',
    icon: <ListNumbers size={15} weight="bold" />,
    run: (x) => x('insertOrderedList'),
  },
  {
    id: 'formatBlock:blockquote',
    label: 'Quote',
    icon: <Quotes size={15} weight="bold" />,
    run: (x) => x('formatBlock', 'blockquote'),
  },
]

export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder,
  minRows = 7,
}: {
  id: string
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minRows?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const [empty, setEmpty] = useState(() => isEmptyHtml(value))

  /* Seeded once, and again only when the value is replaced from outside —
     publishing clears the composer, and the editor has to follow. */
  useEffect(() => {
    const el = box.current
    if (!el) return
    if (el.innerHTML !== value && document.activeElement !== el) {
      el.innerHTML = value
      setEmpty(isEmptyHtml(value))
    }
  }, [value])

  const read = () => {
    const el = box.current
    if (!el) return
    /* Sanitised here as well as at render: it keeps what is stored clean, so
       an old row cannot be the only thing standing between a member and a
       script tag if a future renderer ever forgets. */
    const html = sanitizeHtml(el.innerHTML)
    setEmpty(isEmptyHtml(html))
    onChange(html)
  }

  const exec = (command: string, argument?: string) => {
    box.current?.focus()
    /* `execCommand` is deprecated and universally implemented. The alternative
       is a selection-model editor, which is a library, and a library here is
       200 kB to make a gym owner's paragraph bold. */
    document.execCommand(command, false, argument)
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
      <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-1">
        {COMMANDS.map((command) => (
          <ToolButton
            key={command.id}
            label={command.label}
            onPress={() => command.run(exec)}
          >
            {command.icon}
          </ToolButton>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        <ToolButton label="Add a link" onPress={addLink}>
          <LinkIcon size={15} weight="bold" />
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
          onInput={read}
          onBlur={read}
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
  onPress,
  children,
}: {
  label: string
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      /* The mousedown is what would move the caret out of the text before the
         command ran; taking it here keeps the selection where the user left it. */
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className="flex size-7 items-center justify-center rounded-md text-ink-2 transition-colors duration-150 hover:bg-line hover:text-ink active:scale-[0.94]"
    >
      {children}
    </button>
  )
}
