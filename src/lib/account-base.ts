import { activeProfile } from './profiles'
import { readSyncLink } from './sync'

/**
 * The account's own server, or null when this profile has no account.
 *
 * The same address `/api/enforma/me` and the capabilities probe already talk
 * to, normalised the same way. Every route that needs the account's server
 * asks here rather than re-deriving it, so a change to how a link names its
 * server is a change in one place.
 */
export function accountBase(): string | null {
  const id = activeProfile()?.id
  const link = id ? readSyncLink(id) : null
  if (!link) return null
  return link.server.trim().replace(/\/+$/, '') || '/pb'
}
