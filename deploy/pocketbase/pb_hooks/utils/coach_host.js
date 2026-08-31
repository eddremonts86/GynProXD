/**
 * Whether the model that designs programmes is ours or somebody else's.
 *
 * This decides a sentence a member reads before they type anything, and the two
 * sentences are not variations of each other: one says nothing reaches a third
 * party and the other says their words do. Getting it wrong in the reassuring
 * direction is the failure that matters, so it lives here, on its own, with
 * tests — rather than inline in a handler where nothing can reach it.
 *
 * Judged on the address, because the address is the only part that cannot be
 * wishful. Loopback, the private ranges, a `.local`/`.internal` suffix, or a
 * bare container name on our own compose network are ours. Anything routable on
 * the public internet is not. Anything unrecognised is treated as external.
 */
function coachHostFor(baseUrl) {
  const authority = String(baseUrl || '')
    .replace(/^[a-z]+:\/\//i, '')
    .split('/')[0]
    .split('?')[0]
    .trim()

  /* An IPv6 literal arrives bracketed and is full of colons, so the port has to
     come off differently for it. Stripping the brackets and then splitting on
     ':' the way a name is split leaves `::1` as an empty string — which read as
     unparseable, and answered `external` for the most local address there is. */
  const bracketed = authority.match(/^\[([^\]]+)\]/)
  const host = (bracketed ? bracketed[1] : authority.split(':')[0]).toLowerCase()

  if (host === '') return 'external'

  const ours =
    host === 'localhost' ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /\.(local|internal)$/.test(host) ||
    /* A name with no dot is a service on our own compose network — `ollama`,
       `llm`, `pocketbase`. A public host always has one. */
    host.indexOf('.') === -1

  return ours ? 'self' : 'external'
}

module.exports = { coachHostFor }
