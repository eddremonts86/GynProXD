/**
 * How many people may work a gym's desk, and who decides.
 *
 * Here rather than beside the handlers because each hook handler runs in its
 * own isolated VM: a function declared next to one is invisible inside it, and
 * calling it fails as a bare 400 with nothing in the log.
 */

/**
 * The roster, per plan.
 *
 * Base is one, which is not a restriction so much as a description: a Base gym
 * is the account it was provisioned to. Plus is five, which is a desk, a
 * manager and a couple of coaches — past that a gym is really asking for the
 * second-rooms feature, which is a different thing and is marked as one.
 *
 * Counted against operators *plus* standing invitations, because an invitation
 * is a seat somebody is holding. Counting only the accepted ones would let a
 * gym invite thirty people and discover the cap one acceptance at a time.
 */
const SEATS = { base: 1, plus: 5 }

function seatsFor(plan) {
  return SEATS[String(plan || '')] ?? SEATS.base
}

/**
 * Whether this account may change who works the desk.
 *
 * Only the owner. Every operator being able to edit the roster means an invited
 * operator can remove the person who invited them, and the account belongs to
 * whoever moves first. Publishing is the shared act; the roster is not.
 */
function isOwner(gym, userId) {
  return !!userId && String(gym.get('owner') || '') === userId
}

/** Addresses are the same address whatever case they were typed in. */
function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase()
}

/**
 * The whole decision about adding somebody, so a test can ask it directly.
 *
 * Returns null to allow, or the sentence to refuse with.
 */
function refuseInvite(gym, userId, email, taken) {
  if (!isOwner(gym, userId)) {
    return 'Only the gym’s owner can change who works the desk.'
  }
  if (!email || email.indexOf('@') < 1) {
    return 'That does not look like an email address.'
  }
  const seats = seatsFor(gym.get('plan'))
  if (taken >= seats) {
    return seats === 1
      ? 'Base covers one person at the desk. Plus covers five.'
      : `That is all ${seats} seats. Remove somebody first.`
  }
  return null
}

module.exports = { SEATS, seatsFor, isOwner, normaliseEmail, refuseInvite }
