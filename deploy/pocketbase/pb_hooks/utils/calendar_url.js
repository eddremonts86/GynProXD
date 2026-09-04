/**
 * A published calendar, read from its own address.
 *
 * The easy way in, and the reason it exists: iCloud has no OAuth for calendars,
 * so the only live alternative was an app-specific password that grants a third
 * party everything in somebody's iCloud. A published address grants one
 * calendar and asks the member to remember nothing.
 *
 * **What the member gives up instead, stated plainly because the screen has to
 * say it too.** A published address is not authenticated: anyone who has it can
 * read that calendar. It is a smaller thing to leak than an iCloud password and
 * it is leaked differently — secret rather than public is the trade, not more
 * versus less. Which is why the address is sealed here like any other
 * credential, and why no route ever gives it back.
 *
 * Everything in this file is pure, so `calendar-url.spec.ts` can evaluate the
 * shipped file directly. The talking is in `calendar_url.pb.js`.
 */

/** The same three weeks every other provider reads. */
const DAYS_AHEAD = 21
/** A published calendar can be a decade of history. A bound, not a rule. */
const MAX_BYTES = 2 * 1024 * 1024

/**
 * The address, normalised, or '' when it is not one we will fetch.
 *
 * `webcal://` is what Apple, Google and Outlook all hand out when you publish a
 * calendar, and it is `https://` wearing a hat — no client has ever spoken a
 * "webcal" protocol. Accepting it verbatim is the difference between pasting
 * what the provider gave you and being told to edit it first.
 *
 * **The refusals are the point of this function.** A server that fetches an
 * arbitrary address on request is an open door onto everything the server can
 * reach and the caller cannot: the metadata endpoint on a cloud host, another
 * container on the same compose network, an admin panel bound to loopback. So
 * anything that is not plainly a public http(s) address is refused, and the
 * classifier that decides is the one `coach_host.js` already uses to tell our
 * own network from the public internet — shared rather than restated, because
 * two versions of this rule would drift and only one of them is checked.
 */
/* `hostLabel` is declared below and hoisted, which is how it can be used here. */
function normalizeUrl(raw, hostKind, allowLocal) {
  let text = String(raw || '').trim()
  if (!text) return ''
  /* One scheme swap, before anything else looks at it. */
  if (/^webcal:\/\//i.test(text)) text = 'https://' + text.slice('webcal://'.length)
  if (!/^https?:\/\//i.test(text)) return ''
  /* No credentials in the address: `https://user:pass@host/` would send those
     to whatever the host turns out to be, and a member pasting one has almost
     certainly pasted the wrong thing. */
  const authority = text.replace(/^[a-z]+:\/\//i, '').split('/')[0]
  if (authority.indexOf('@') !== -1) return ''
  if (!authority) return ''
  const host = hostLabel(text)

  /**
   * No bare IP addresses, which closes the whole class in one line.
   *
   * Nobody publishes a calendar at an IP literal — every provider hands out a
   * hostname — so refusing them costs nothing real and removes every address
   * that a private-range test has to be right about. That matters, because the
   * classifier borrowed from `coach_host.js` was written to answer a different
   * question and does not know `169.254.169.254`: the link-local range where
   * every cloud keeps its instance metadata, and the first thing anybody
   * probing this would try. It is refused here whatever that function thinks,
   * and so is every IPv6 literal, which it cannot judge at all.
   */
  const ipv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  const ipv6 = host.indexOf(':') !== -1

  /**
   * The escape hatch is loopback and nothing else.
   *
   * It exists because the walks serve a fake published calendar on 127.0.0.1
   * and could not be written otherwise. It was a blanket `allowLocal` for one
   * commit and that was wrong: with it set, `169.254.169.254` — every cloud's
   * instance metadata — was accepted and actually fetched. A flag meant for a
   * test harness must not be able to widen the hole it is standing next to, so
   * it now permits exactly the three spellings of this machine and leaves every
   * other private address, every other IP literal and every `.local` name
   * refused whatever it is set to.
   */
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  const local = allowLocal && loopback

  if ((ipv4 || ipv6) && !local) return ''

  /* Then the names: our own compose network, a `.local` box, anything the
     shared classifier calls ours rather than the public internet. */
  const kind = hostKind(text)
  if (kind === 'self' && !local) return ''
  if (/^http:\/\//i.test(text) && !(allowLocal && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(text))) return ''
  if (text.length > 2000) return ''
  return text
}

/** Whether what came back is an iCalendar at all. */
function looksLikeCalendar(text) {
  return /BEGIN:VCALENDAR/i.test(String(text || ''))
}

/**
 * The name the calendar gives itself, for the one line the screen shows.
 *
 * `X-WR-CALNAME` is what every publisher writes and no standard requires, so an
 * absent one is normal and not a failure. Folded lines are unfolded first:
 * iCalendar wraps at 75 octets by continuing on a line that starts with a
 * space, and a calendar called something long arrives in pieces.
 */
function calendarName(text) {
  const unfolded = String(text || '').replace(/\r?\n[ \t]/g, '')
  const m = /^X-WR-CALNAME[^:\r\n]*:([^\r\n]*)/im.exec(unfolded)
  if (!m) return ''
  return m[1].replace(/\\,/g, ',').replace(/\\n/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}

/**
 * What the screen may show about an address, which is never the address.
 *
 * The host alone. A published URL carries a long opaque token in its path and
 * showing it back would put a readable credential on a screen somebody might
 * screenshot — and would hand it to anyone shoulder-surfing a shared laptop.
 */
function hostLabel(url) {
  const authority = String(url || '').replace(/^[a-z]+:\/\//i, '').split('/')[0]
  const bracketed = authority.match(/^\[([^\]]+)\]/)
  return (bracketed ? bracketed[1] : authority.split(':')[0]).toLowerCase().slice(0, 100)
}

module.exports = { DAYS_AHEAD, MAX_BYTES, normalizeUrl, looksLikeCalendar, calendarName, hostLabel }
