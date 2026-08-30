import DOMPurify from 'dompurify'

/**
 * Formatted bodies for gym messages.
 *
 * The bus is plaintext directory data that one account writes and every member
 * of that gym renders. The moment a body can carry markup, an operator account
 * — or anyone who takes one over — can write script into every member's home
 * screen. So the rule here is not "clean it on the way in": it is cleaned on
 * the way *out*, every time, because the way in is not the only way in. A row
 * can also arrive from the server, and the server never promised anything.
 *
 * Sanitising is DOMPurify's job rather than a hand-rolled allowlist. mXSS,
 * foreign content in `<svg>` and `<math>`, attribute smuggling and namespace
 * confusion are exactly the cases a homemade walker gets wrong, and getting
 * this wrong is stored XSS across a whole gym.
 */

/**
 * What a gym owner needs to describe what they sell, and nothing else. No
 * images (they are a separate, uploaded thing), no tables, no headings above
 * h4 — the card already owns the title.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'h4',
  'blockquote',
  'a',
]

const ALLOWED_ATTR = ['href', 'target', 'rel']

let hooked = false

/**
 * Every link leaves for a new tab and carries `noopener`, so a gym linking to
 * its own booking page cannot hand `window.opener` to it. `nofollow` because
 * these are member broadcasts, not editorial endorsements.
 */
function installHooks(): void {
  if (hooked) return
  hooked = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer nofollow')
    }
  })
}

export function sanitizeHtml(dirty: string): string {
  if (!dirty) return ''
  installHooks()
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    /* `javascript:` and `data:` are refused; the rest of the URI space is not
       ours to police from here. */
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#)/i,
    RETURN_TRUSTED_TYPE: false,
  })
}

/** Markup at all, or a body typed before formatting existed? */
export function looksLikeHtml(body: string): boolean {
  return /<\/?(?:p|br|ul|ol|li|strong|b|em|i|u|s|h4|blockquote|a)\b[^>]*>/i.test(body)
}

/**
 * The text inside the markup, for the places that cannot render any: the
 * Today card's opening line, a notification, a search index.
 */
export function htmlToPlain(html: string): string {
  if (!looksLikeHtml(html)) return html
  const clean = sanitizeHtml(html)
  /* Both ends of a block become a break before the tags are dropped, not just
     the closing one: `contenteditable` leaves the first sentence as a bare
     text node, so a list that follows it has no `</p>` in front of it and the
     two would run together — "paid monthly.A movement screen". */
  const spaced = clean
    .replace(/<\/(p|li|h4|blockquote|ul|ol)>/gi, '\n\n')
    .replace(/<(p|li|h4|blockquote|ul|ol)\b[^>]*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
  const doc = new DOMParser().parseFromString(spaced, 'text/html')
  return (doc.body.textContent ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

/** True when the body carries no words, however much markup is wrapped round it. */
export function isEmptyHtml(html: string): boolean {
  return htmlToPlain(html).trim().length === 0
}

/**
 * A body typed before rich text existed, brought forward: blank lines become
 * paragraphs, single newlines become breaks. Old messages keep rendering the
 * way they always did instead of collapsing into one slab.
 */
export function plainToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** What a body renders as, whichever era it was written in. */
export function bodyHtml(body: string): string {
  return looksLikeHtml(body) ? sanitizeHtml(body) : plainToHtml(body)
}
