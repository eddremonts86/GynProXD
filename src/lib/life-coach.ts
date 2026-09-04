import { coachDestination, extractJson } from './ai-plan'
import { activeAuthHeader } from './sync'
import { parseAnchors, validateProposal, type ProposedAnchor } from './anchor-parse'

/**
 * The companion: a sentence about somebody's week, read by a model when there
 * is one and by regexes when there is not.
 *
 * The division of labour is the same one `ai-plan.ts` settled on and it is the
 * reason this is safe to offer at all. The model does not write to the profile
 * and it does not decide anything: it proposes anchors, every proposal goes
 * through `validateProposal` — the same gate the deterministic path uses — and
 * a person taps each survivor before it becomes a fact. A hallucinated hour has
 * no route to the day that the regex path does not also have.
 *
 * The deterministic path is not a degraded mode. It runs first, instantly and
 * offline, so there is something on screen to check while the coach thinks, and
 * it is what ships on a server with no coach at all. What the model buys is
 * idiom, ordering and typos.
 *
 * `where()` is re-exported rather than reimplemented because the sentence a
 * member reads before typing has to be the same answer as the request that is
 * then made. `ai-plan.ts` says at length why those two came apart once and what
 * it cost.
 */

export { coachDestination as where } from './ai-plan'

/**
 * Well short of the programme coach's three minutes.
 *
 * This is one short answer about one sentence, not a periodised programme, and
 * a member watching a text box has a different patience than one who pressed
 * "design my programme". The deterministic proposals are already on screen by
 * the time this starts, so the cost of giving up is nothing.
 */
const REQUEST_TIMEOUT_MS = 45_000

/** As many as a paragraph could reasonably describe. Beyond this is noise. */
const MAX_PROPOSALS = 8

export function buildPrompt(text: string): string {
  return `Read this description of somebody's week and list the fixed hours in it.

Their words, between the markers:
--- BEGIN
${text.slice(0, 1200)}
--- END

Rules:
- List only hours they do NOT choose: work, shifts, the commute, school runs, caring for somebody, appointments that repeat. Not training, not meals, not hobbies they might move.
- One entry per thing. "work 9 to 5 and the school run at 8:15" is two.
- start and end are 24-hour "HH:MM". end must be later than start on the same day. Something that runs past midnight is two entries.
- days: any of mon,tue,wed,thu,fri,sat,sun. If they did not say, use the five weekdays.
- kind: "work", "care" for looking after somebody, "travel" for getting there, "fixed" for anything else.
- label: at most 40 characters, in their own words where possible. No dates.
- start_from, end_from, days_from: "quoted" if they said it outright, "inferred" if you worked it out. Be honest about this. "9 to 5" means the end is inferred.
- If they described no fixed hours at all, reply with an empty list. Do not invent a working day.

Reply with ONE minified JSON object on a single line, nothing else:
{"anchors":[{"label":"work","days":["mon","tue","wed","thu","fri"],"start":"09:00","end":"17:00","kind":"work","start_from":"quoted","end_from":"inferred","days_from":"inferred"}]}`
}

/** Whatever survives the gate, capped. Exported for its own tests. */
export function validateAnchors(raw: unknown, clause: string): ProposedAnchor[] {
  const response = raw as { anchors?: unknown }
  if (!response || !Array.isArray(response.anchors)) return []
  const out: ProposedAnchor[] = []
  for (const entry of response.anchors.slice(0, MAX_PROPOSALS)) {
    const checked = validateProposal({ ...(entry as object), clause })
    if (checked) out.push(checked)
  }
  return out
}

async function askCoach(text: string): Promise<ProposedAnchor[] | null> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch('/api/minimax/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(activeAuthHeader() ?? {}) },
      signal: controller.signal,
      body: JSON.stringify({
        model: __AI_COACH_MODEL__,
        max_tokens: 900,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You extract fixed weekly commitments from a description. You respond with a single JSON object and nothing else.',
          },
          { role: 'user', content: buildPrompt(text) },
        ],
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') return null
    const anchors = validateAnchors(extractJson(content), text.slice(0, 200))
    /* An empty list from a real answer is a real answer: somebody wrote a
       paragraph with no fixed hours in it. It is not a reason to fall back,
       because the regexes will find nothing either. */
    return anchors
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

export interface Proposals {
  anchors: ProposedAnchor[]
  /** Which half produced them, for the line above the list. */
  source: 'coach' | 'local'
}

/** Kill switch, shared with the programme coach: localStorage forma-coach=off. */
function coachSwitchedOff(): boolean {
  try {
    return localStorage.getItem('forma-coach') === 'off'
  } catch {
    return false
  }
}

/**
 * The one entry point the screen calls. Always resolves to something usable.
 *
 * The local pass is returned first by the caller and this is the upgrade, so a
 * coach that times out costs nobody anything they could see.
 */
export async function proposeAnchors(text: string): Promise<Proposals> {
  const local = parseAnchors(text)
  if (!coachDestination().coach || coachSwitchedOff()) return { anchors: local, source: 'local' }
  const asked = await askCoach(text)
  if (asked === null) return { anchors: local, source: 'local' }
  /* A coach that found less than the regexes did is a coach having a bad day.
     Keeping whichever saw more is not a quality judgement, it is refusing to
     lose work that is already on the screen. */
  return asked.length >= local.length
    ? { anchors: asked, source: 'coach' }
    : { anchors: local, source: 'local' }
}
