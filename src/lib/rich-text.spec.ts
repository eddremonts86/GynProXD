// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  bodyHtml,
  htmlToPlain,
  isEmptyHtml,
  looksLikeHtml,
  plainToHtml,
  sanitizeHtml,
} from './rich-text'

/**
 * The gym bus is one account writing and a whole gym rendering. Everything
 * below is the case where that account is not the person it was issued to.
 */
describe('what a formatted body is not allowed to carry', () => {
  it('drops a script tag and keeps the sentence around it', () => {
    const out = sanitizeHtml('<p>Open at six.</p><script>alert(1)</script>')
    expect(out).not.toContain('script')
    expect(out).toContain('Open at six.')
  })

  it('drops an inline handler and keeps the emphasis', () => {
    const out = sanitizeHtml('<strong onclick="steal()">Two for one</strong>')
    expect(out).not.toContain('onclick')
    expect(out).toContain('<strong>Two for one</strong>')
  })

  it('refuses a javascript: link', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">tap</a>')).not.toContain('javascript')
  })

  it('refuses a data: URL dressed as a link', () => {
    const out = sanitizeHtml('<a href="data:text/html;base64,PHNjcmlwdD4=">tap</a>')
    expect(out).not.toContain('data:')
  })

  it('strips an image, because pictures are uploaded and not written', () => {
    expect(sanitizeHtml('<img src=x onerror=alert(1)>')).not.toContain('img')
  })

  it('strips svg, where foreign content hides', () => {
    expect(sanitizeHtml('<svg><use href="#x" /></svg>')).not.toContain('svg')
  })

  it('strips an iframe outright', () => {
    expect(sanitizeHtml('<iframe src="https://example.com"></iframe>')).not.toContain('iframe')
  })

  it('strips style, so a body cannot repaint the card it sits in', () => {
    const out = sanitizeHtml('<p style="position:fixed;inset:0">hi</p>')
    expect(out).not.toContain('position')
  })
})

describe('what it is allowed to carry', () => {
  it('keeps the shapes the toolbar can produce', () => {
    const out = sanitizeHtml(
      '<h4>Thursday</h4><p><strong>Braise</strong> and <em>cod</em></p><ul><li>89 kr</li></ul>',
    )
    expect(out).toContain('<h4>Thursday</h4>')
    expect(out).toContain('<strong>Braise</strong>')
    expect(out).toContain('<em>cod</em>')
    expect(out).toContain('<li>89 kr</li>')
  })

  it('keeps all three heading levels', () => {
    const out = sanitizeHtml('<h4>One</h4><h5>Two</h5><h6>Three</h6>')
    expect(out).toBe('<h4>One</h4><h5>Two</h5><h6>Three</h6>')
  })

  it('refuses h1 through h3, which belong to the page around the card', () => {
    const out = sanitizeHtml('<h1>Huge</h1><h2>Big</h2><h3>Medium</h3>')
    expect(out).not.toMatch(/<h[123]/)
    /* The words survive; only the level is taken away. */
    expect(out).toContain('Huge')
    expect(out).toContain('Medium')
  })

  it('keeps the emphasis a gym reaches for', () => {
    const out = sanitizeHtml(
      '<p><u>Saturday</u>, <mark>twelve places</mark>, 24 m<sup>2</sup>, H<sub>2</sub>O</p>',
    )
    expect(out).toContain('<u>Saturday</u>')
    expect(out).toContain('<mark>twelve places</mark>')
    expect(out).toContain('<sup>2</sup>')
    expect(out).toContain('<sub>2</sub>')
  })

  it('keeps a divider between sections', () => {
    expect(sanitizeHtml('<p>One</p><hr><p>Two</p>')).toContain('<hr>')
  })

  it('refuses a table: the menu and shop templates already are one', () => {
    const out = sanitizeHtml('<table><tr><td>Beef</td><td>89 kr</td></tr></table>')
    expect(out).not.toContain('<table')
    expect(out).toContain('Beef')
  })

  it('refuses div and span, which exist only to carry attributes', () => {
    const out = sanitizeHtml('<div data-x="1"><span class="y">Text</span></div>')
    expect(out).not.toMatch(/<(div|span)/)
    expect(out).toContain('Text')
  })

  it('keeps an https link and hardens it', () => {
    const out = sanitizeHtml('<a href="https://nordhavn.test/book">Book</a>')
    expect(out).toContain('href="https://nordhavn.test/book"')
    expect(out).toContain('rel="noopener noreferrer nofollow"')
    expect(out).toContain('target="_blank"')
  })

  it('keeps mailto, which is how a gym is answered', () => {
    expect(sanitizeHtml('<a href="mailto:desk@nordhavn.test">Write</a>')).toContain('mailto:')
  })
})

describe('bodies written before formatting existed', () => {
  it('recognises plain text as plain', () => {
    expect(looksLikeHtml('Open at six.\n\nClosed Sunday.')).toBe(false)
  })

  it('turns blank lines into paragraphs instead of one slab', () => {
    expect(plainToHtml('Open at six.\n\nClosed Sunday.')).toBe(
      '<p>Open at six.</p><p>Closed Sunday.</p>',
    )
  })

  it('keeps a single newline as a break', () => {
    expect(plainToHtml('Two lines\nof one thought')).toBe('<p>Two lines<br>of one thought</p>')
  })

  it('escapes a plain body that happens to contain a bracket', () => {
    expect(plainToHtml('Under <10 minutes')).toBe('<p>Under &lt;10 minutes</p>')
  })

  it('routes each era to the right converter', () => {
    expect(bodyHtml('Plain line')).toBe('<p>Plain line</p>')
    expect(bodyHtml('<p>Already rich</p>')).toBe('<p>Already rich</p>')
  })
})

describe('the words without the markup', () => {
  it('breaks list items apart instead of running them together', () => {
    expect(htmlToPlain('<ul><li>Beef</li><li>Cod</li></ul>')).toBe('Beef\n\nCod')
  })

  it('separates a bare opening sentence from the list under it', () => {
    /* What contenteditable actually produces: no <p> around the first line. */
    expect(htmlToPlain('Paid monthly.<ul><li>A screen on day one</li></ul>')).toBe(
      'Paid monthly.\n\nA screen on day one',
    )
  })

  it('breaks a heading away from the paragraph under it', () => {
    expect(htmlToPlain('<h4>What you get</h4><p>Six weeks.</p>')).toBe('What you get\n\nSix weeks.')
  })

  it('treats a divider as a break between sections', () => {
    expect(htmlToPlain('<p>One</p><hr><p>Two</p>')).toBe('One\n\nTwo')
  })

  it('leaves plain text alone', () => {
    expect(htmlToPlain('Just a sentence')).toBe('Just a sentence')
  })

  it('calls markup with no words empty', () => {
    expect(isEmptyHtml('<p></p><p><br></p>')).toBe(true)
    expect(isEmptyHtml('<p>A word</p>')).toBe(false)
  })
})
