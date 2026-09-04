import { extractJson } from './ai-plan'
import { where } from './life-coach'
import { accountBase } from './account-base'
import { activeAuthHeader } from './sync'
import { INTIMATE_ACTIVITIES, type IntimateActivity, type Limitation } from '../data/intimacy'
import { searchActivities } from './intimacy-search'

/**
 * Asking a model to choose from the library, when the words do not match.
 *
 * The local search is text over twenty entries, so it finds "pillow" and
 * "chair" and finds nothing at all for "something for a night when we are both
 * exhausted". That sentence is exactly what somebody would type, and a model is
 * the only thing that can turn it into three ids.
 *
 * ## What leaves the device, and what does not
 *
 * **Only the sentence they typed, and the library's own ids.** Not the
 * limitations: those are Article 9 data about a body, they are kept on the
 * device on purpose (`lib/intimacy.ts` says why at length), and they are not
 * needed for the choosing — the filtering happens here, before the ids are
 * offered and again after the answer comes back. So a model that returns
 * something unkind to a bad back cannot put it on screen.
 *
 * The sentence itself is the member's to send and it is the same trade the
 * intake makes with its paragraph: it goes only when they tap, and the line
 * above the button says where, from the same `where()` both screens use.
 *
 * ## What comes back
 *
 * Ids, and never an entry. `validateSuggestion` keeps only ids that exist in
 * the library and drops the rest, so a model cannot invent an arrangement,
 * cannot rename one, and cannot describe something the library does not say.
 * That is the same shape `validateProposal` gives the anchor parser and the
 * reason both are safe to offer at all.
 */

export const MAX_SUGGESTIONS = 3
export const MAX_REASON = 120
const REQUEST_TIMEOUT_MS = 45_000

export interface Suggestion {
  activity: IntimateActivity
  /** One short sentence about why this one, from the model. */
  reason: string
}

export type SuggestFailure = 'no-coach' | 'cap' | 'unreachable' | 'unreadable' | 'nothing'
export type SuggestResult =
  | { ok: true; suggestions: Suggestion[] }
  | { ok: false; why: SuggestFailure }

/** The em-dash ban applies to model output too. */
function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/[—–]/g, ',').replace(/\s+/g, ' ').trim()
  return text.length > 0 ? text.slice(0, maxLength) : undefined
}

/** One line per entry: the id, the name, the effort and the posture. No limitations. */
function libraryLines(pool: readonly IntimateActivity[]): string {
  return pool
    .map(
      (a) =>
        `- ${a.id}: ${a.name}. ${a.effort}, ${a.postures.join(' and ')}, ${a.facing ? 'facing' : 'not facing'}.`,
    )
    .join('\n')
}

export function buildLibraryPrompt(text: string, pool: readonly IntimateActivity[]): string {
  return `Somebody is choosing from a fixed list of ${pool.length} arrangements for intimacy. Pick the ones that best answer what they asked for.

What they asked for, between the markers:
--- BEGIN
${text.slice(0, 400)}
--- END

The list. Use these ids and no others:
${libraryLines(pool)}

Rules:
- Reply with at most ${MAX_SUGGESTIONS} ids, best first, and fewer if fewer fit.
- Every id must be one from the list above. Do not invent an id, a name or an arrangement.
- "why": one sentence of at most ${MAX_REASON} characters saying why this one answers what they asked. Plain and factual, in the third person. No encouragement, no exclamation marks, no emojis.
- If nothing on the list answers it, reply with an empty list rather than the closest thing.

Reply with ONE minified JSON object on a single line, nothing else:
{"picks":[{"id":"seated-facing","why":"..."}]}`
}

/**
 * Whatever survives the gate: ids that exist, each once, with a sentence.
 *
 * `pool` is already filtered by whatever the member is working around, so an id
 * the model returned that is unkind to them is not in it and is dropped here
 * rather than shown. That is the second half of keeping the limitations on the
 * device: they never went out, and they still decide what comes back.
 */
export function validateSuggestion(
  raw: unknown,
  pool: readonly IntimateActivity[],
): Suggestion[] {
  const response = raw as { picks?: unknown } | null
  if (!response || !Array.isArray(response.picks)) return []
  const byId = new Map(pool.map((a) => [a.id, a]))
  const out: Suggestion[] = []
  const seen = new Set<string>()
  for (const entry of response.picks.slice(0, 12)) {
    const item = entry as { id?: unknown; why?: unknown } | null
    if (!item || typeof item.id !== 'string') continue
    const activity = byId.get(item.id)
    if (!activity || seen.has(activity.id)) continue
    const reason = cleanText(item.why, MAX_REASON)
    if (!reason) continue
    seen.add(activity.id)
    out.push({ activity, reason })
    if (out.length >= MAX_SUGGESTIONS) break
  }
  return out
}

/** Kill switch, shared with every other coach here: localStorage forma-coach=off. */
function coachSwitchedOff(): boolean {
  try {
    return localStorage.getItem('forma-coach') === 'off'
  } catch {
    return false
  }
}

function endpoint(): { url: string; headers: Record<string, string> } | null {
  const headers = activeAuthHeader()
  if (!headers) return null
  if (__AI_COACH__) return { url: '/api/minimax/chat/completions', headers }
  const base = accountBase()
  if (!base) return null
  return { url: `${base}/api/minimax/chat/completions`, headers }
}

/**
 * The one entry point the screen calls. Never automatic: it costs a metered
 * call and it sends a sentence about somebody's sex life to a vendor, so it
 * happens when they tap and not before.
 */
export async function askLibrary(
  text: string,
  limitations: readonly Limitation[] = [],
): Promise<SuggestResult> {
  const wanted = text.trim()
  if (wanted === '') return { ok: false, why: 'nothing' }
  if (!where().coach || coachSwitchedOff()) return { ok: false, why: 'no-coach' }
  const at = endpoint()
  if (!at) return { ok: false, why: 'no-coach' }

  /* Filtered before the ids are offered, so nothing unkind is ever a candidate. */
  const pool = searchActivities({ limitations }, INTIMATE_ACTIVITIES)
  if (pool.length === 0) return { ok: false, why: 'nothing' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(at.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...at.headers },
      signal: controller.signal,
      body: JSON.stringify({
        model: __AI_COACH_MODEL__,
        max_tokens: 400,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You pick entries from a fixed list by id. You respond with a single JSON object and nothing else.',
          },
          { role: 'user', content: buildLibraryPrompt(wanted, pool) },
        ],
      }),
    })
    if (res.status === 429) return { ok: false, why: 'cap' }
    if (!res.ok) return { ok: false, why: 'unreachable' }
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') return { ok: false, why: 'unreadable' }
    const suggestions = validateSuggestion(extractJson(content), pool)
    /* An empty list from a real answer is a real answer: the model was asked to
       say nothing rather than offer the closest thing. */
    return { ok: true, suggestions }
  } catch {
    return { ok: false, why: 'unreachable' }
  } finally {
    clearTimeout(timer)
  }
}
