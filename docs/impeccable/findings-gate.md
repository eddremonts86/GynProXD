# Review-all findings — 2026-08-26

⚠️ DEGRADED: single-context (sub-agents cannot drive the MCP browser tab;
audit + critique ran as one assessment). Battery evidence: 58 unit tests +
5 Playwright scripts green on 1f83fec before any change.

## P1 — fixed in this run

- **GATE-1 · create errors anchor to the wrong field.** Every validation
  message ("Give the profile a name", gym required, short passphrase)
  rendered under *Repeat passphrase*, painting that field red while the
  real offender sat untouched. Fix: per-field error state + focus moves
  to the failing field.
- **GATE-2 · roles invisible on the lock screen.** A gym-operator or
  admin card was indistinguishable from a member's. On a shared gym
  device that is the one place identity matters. Fix: role tags on the
  profile cards.
- **NAV-1 · a gym operator's Inbox is dead by construction.** Authors
  never receive their own broadcasts, so the operator's inbox is a
  permanent empty state whose copy ("You train independently…") makes no
  sense for them. Fix: no Inbox nav item for the gym role; /inbox
  redirects them to /gym. Their surface is the Sent list.

## P2 — fixed in this run

- **GATE-3 · passphrases are write-only.** No visibility toggle on a
  credential that is unrecoverable by design — a typo at creation locks
  the profile forever. Fix: show/hide toggle on all passphrase fields.
- **ADMIN-1 · the self row shows a disabled control styled as enabled.**
  The role select on your own row was pointer-events-none + opacity,
  reading as a broken control. Fix: the self row shows its role tag only;
  the select is gone.
- **NAV-2 · role-blind landing after unlock.** A gym operator unlocking
  landed on Today (a training surface); an admin landed on Today too.
  Fix: unlocking into `/` routes gym → /gym and admin → /admin. Any
  other route is left alone (resume where you were).

## Noted, not changed

- Admin-without-a-gym inbox copy suggests picking a gym in Settings —
  acceptable: an admin may also train.
- Unlock error anchoring was already correct (under the passphrase).
- Focus already lands on the passphrase after picking a profile card.
- Core training flows (Onboarding → Generated → Planner → Session →
  History) were redesigned and walked earlier this cycle; verify-all
  re-walked them green today. No fresh nonsense found there.
