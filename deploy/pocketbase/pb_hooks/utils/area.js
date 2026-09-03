/**
 * One spelling of a place.
 *
 * A member types "Lisboa", a gym types "lisboa ", and an exact-match rule reads
 * those as two different towns and delivers nothing. The rule cannot normalise,
 * so both sides are normalised on the way in: trimmed, collapsed whitespace,
 * lower case. Stored lower case and shown back capitalised by the client, which
 * is a smaller lie than a message that silently reaches nobody.
 *
 * Deliberately no list of valid places. A fixed list is a product decision
 * nobody has made, it is wrong in every country it was not written for, and it
 * would turn "where do you train" into a form somebody has to be in the right
 * city to answer.
 */
function normaliseArea(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 60)
}

module.exports = { normaliseArea }
