import { epley1rm, exerciseById } from './exercises'
import { exerciseIllustration } from './images'
import { challengeCalendar, type ActiveChallenge, type Challenge } from './challenge'
import { MUSCLE_SHORT, formatLongDate, pluralize } from './labels'
import { INTENSITY_SETS } from './intensity'
import { workoutTotals } from './stats'
import type { MuscleGroup, PlannedExercise, Workout } from './types'

/**
 * The one-image session card: a self-contained poster of a day's training,
 * drawn on a canvas so the app's loaded fonts just work (no SVG font
 * embedding) and rasterisation cannot be tainted — only the bundled
 * same-origin illustrations are drawn, never the photo CDN. The poster
 * commits to a single dark look on purpose; it is an artifact, not a page.
 */

const POSTER = {
  width: 1080,
  pad: 72,
  bg: '#141412',
  ink: '#f2f1ed',
  ink2: '#c8c7c1',
  ink3: '#9b9a93',
  cell: '#1e1e1b',
  line: '#33332e',
  font: '"Geist Variable", "Geist", system-ui, sans-serif',
}

export interface CardExercise {
  name: string
  muscle: MuscleGroup
  illustration: string | null
  detail: string
}

export interface SessionCardInput {
  title: string
  subtitle: string
  exercises: CardExercise[]
  /** Short footer chips: intensity, EC, totals. */
  footer: string[]
}

function cardExercise(exerciseId: string, detail: string): CardExercise {
  const ex = exerciseById(exerciseId)
  return {
    name: ex?.name ?? exerciseId,
    muscle: ex?.muscle ?? 'other',
    illustration: exerciseIllustration(exerciseId),
    detail,
  }
}

/** A finished session: what was actually lifted. */
export function cardFromWorkout(workout: Workout): SessionCardInput {
  const totals = workoutTotals(workout)
  const exercises = workout.exercises.map((e) => {
    const top = e.sets.reduce(
      (a, b) => (epley1rm(b.weight, b.reps) > epley1rm(a.weight, a.reps) ? b : a),
      e.sets[0] ?? { weight: 0, reps: 0 },
    )
    const topText =
      top.weight > 0 ? `top ${top.weight}kg × ${top.reps}` : top.durationSec ? `${top.durationSec}s` : `× ${top.reps}`
    return cardExercise(e.exerciseId, `${pluralize(e.sets.length, 'set')} · ${topText}`)
  })
  const footer = [formatLongDate(workout.date)]
  if (workout.intensity) footer.push(`${INTENSITY_SETS[workout.intensity]} sets each`)
  if (workout.ec) footer.push('Pushed hard')
  footer.push(
    pluralize(totals.sets, 'set'),
    `${Math.round(totals.volume).toLocaleString('en-GB')} kg`,
  )
  return { title: 'Session done', subtitle: '', exercises, footer }
}

/** A planned day: the poster a member (or a gym wall) trains from. */
export function cardFromPlannedDay(
  planName: string,
  dayLabel: string,
  exercises: PlannedExercise[],
): SessionCardInput {
  return {
    title: dayLabel,
    subtitle: planName,
    exercises: exercises.map((pe) => cardExercise(pe.exerciseId, '')),
    /* The poster carries the whole dose ladder so one printed sheet serves
       every member, the way a gym wall poster has to. */
    footer: [
      `Easy ${INTENSITY_SETS.I} sets`,
      `Normal ${INTENSITY_SETS.II}`,
      `Big day ${INTENSITY_SETS.III}`,
      'rest ≤ 90s',
    ],
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w
    if (ctx.measureText(probe).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else {
      line = probe
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, 2)
}

function drawBrand(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.fillStyle = POSTER.ink3
  ctx.font = `600 26px ${POSTER.font}`
  ctx.fillText('enForma', POSTER.pad, y)
}

export async function renderSessionCard(input: SessionCardInput): Promise<Blob> {
  await document.fonts.ready

  const cols = input.exercises.length <= 4 ? 2 : 3
  const rows = Math.ceil(input.exercises.length / cols)
  const gridW = POSTER.width - POSTER.pad * 2
  const gap = 24
  const cellW = (gridW - gap * (cols - 1)) / cols
  const cellH = 280
  const headerH = input.subtitle ? 232 : 208
  const footerH = 128
  const height = headerH + rows * (cellH + gap) - gap + footerH + POSTER.pad

  const canvas = document.createElement('canvas')
  canvas.width = POSTER.width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')

  ctx.fillStyle = POSTER.bg
  ctx.fillRect(0, 0, POSTER.width, height)

  drawBrand(ctx, POSTER.pad)
  ctx.fillStyle = POSTER.ink
  ctx.font = `700 64px ${POSTER.font}`
  ctx.fillText(input.title, POSTER.pad, POSTER.pad + 76)
  if (input.subtitle) {
    ctx.fillStyle = POSTER.ink3
    ctx.font = `400 30px ${POSTER.font}`
    ctx.fillText(input.subtitle, POSTER.pad, POSTER.pad + 120)
  }

  const images = await Promise.all(
    input.exercises.map((e) => (e.illustration ? loadImage(e.illustration) : Promise.resolve(null))),
  )

  input.exercises.forEach((e, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = POSTER.pad + col * (cellW + gap)
    const y = headerH + row * (cellH + gap)

    ctx.fillStyle = POSTER.cell
    ctx.beginPath()
    ctx.roundRect(x, y, cellW, cellH, 16)
    ctx.fill()

    const imgBox = { x: x + 20, y: y + 20, w: cellW - 40, h: 150 }
    const img = images[i]
    if (img) {
      const scale = Math.min(imgBox.w / img.width, imgBox.h / img.height)
      const dw = img.width * scale
      const dh = img.height * scale
      ctx.drawImage(img, imgBox.x + (imgBox.w - dw) / 2, imgBox.y + (imgBox.h - dh) / 2, dw, dh)
    } else {
      ctx.fillStyle = POSTER.line
      ctx.font = `700 44px ${POSTER.font}`
      ctx.textAlign = 'center'
      ctx.fillText(MUSCLE_SHORT[e.muscle], imgBox.x + imgBox.w / 2, imgBox.y + imgBox.h / 2 + 16)
      ctx.textAlign = 'left'
    }

    ctx.fillStyle = POSTER.ink
    ctx.font = `600 26px ${POSTER.font}`
    const lines = wrapText(ctx, e.name, cellW - 40)
    lines.forEach((line, li) => ctx.fillText(line, x + 20, y + 205 + li * 32))
    if (e.detail) {
      ctx.fillStyle = POSTER.ink3
      ctx.font = `400 22px ${POSTER.font}`
      ctx.fillText(e.detail, x + 20, y + 205 + lines.length * 32)
    }
  })

  const footY = height - footerH + 16
  ctx.strokeStyle = POSTER.line
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(POSTER.pad, footY)
  ctx.lineTo(POSTER.width - POSTER.pad, footY)
  ctx.stroke()
  ctx.fillStyle = POSTER.ink2
  ctx.font = `500 26px ${POSTER.font}`
  ctx.fillText(input.footer.join('   ·   '), POSTER.pad, footY + 52)

  return toBlob(canvas)
}

/** The challenge wall poster: the whole month as a tappable-looking grid. */
export async function renderChallengeCard(
  challenge: Challenge,
  gym?: string,
): Promise<Blob> {
  await document.fonts.ready

  const state: ActiveChallenge = { challenge, startedAt: '2026-01-01', completedDays: [] }
  const days = challengeCalendar(state, '1900-01-01')
  const cols = 6
  const rows = Math.ceil(days.length / cols)
  const gridW = POSTER.width - POSTER.pad * 2
  const gap = 16
  const cellW = (gridW - gap * (cols - 1)) / cols
  const cellH = 110
  const headerH = 280
  const footerH = 120
  const height = headerH + rows * (cellH + gap) - gap + footerH + POSTER.pad

  const canvas = document.createElement('canvas')
  canvas.width = POSTER.width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')

  ctx.fillStyle = POSTER.bg
  ctx.fillRect(0, 0, POSTER.width, height)

  drawBrand(ctx, POSTER.pad)
  ctx.fillStyle = POSTER.ink
  ctx.font = `700 64px ${POSTER.font}`
  ctx.fillText(challenge.name, POSTER.pad, POSTER.pad + 76)
  ctx.fillStyle = POSTER.ink3
  ctx.font = `400 30px ${POSTER.font}`
  const exName = exerciseById(challenge.exerciseId)?.name ?? challenge.exerciseId
  ctx.fillText(
    `${exName} · ${challenge.days} days · ${challenge.unit}. One number a day; split it if you need to.`,
    POSTER.pad,
    POSTER.pad + 122,
  )

  days.forEach((d, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = POSTER.pad + col * (cellW + gap)
    const y = headerH + row * (cellH + gap)
    ctx.fillStyle = POSTER.cell
    ctx.beginPath()
    ctx.roundRect(x, y, cellW, cellH, 12)
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.fillStyle = POSTER.ink3
    ctx.font = `500 20px ${POSTER.font}`
    ctx.fillText(String(d.day), x + cellW / 2, y + 34)
    ctx.fillStyle = POSTER.ink
    ctx.font = `700 34px ${POSTER.font}`
    ctx.fillText(String(d.reps), x + cellW / 2, y + 78)
    ctx.textAlign = 'left'
  })

  const footY = height - footerH + 16
  ctx.strokeStyle = POSTER.line
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(POSTER.pad, footY)
  ctx.lineTo(POSTER.width - POSTER.pad, footY)
  ctx.stroke()
  ctx.fillStyle = POSTER.ink2
  ctx.font = `500 26px ${POSTER.font}`
  ctx.fillText(gym ? `${gym} · enForma` : 'enForma', POSTER.pad, footY + 52)

  return toBlob(canvas)
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png')
  })
}

/** Native share when the platform offers it, plain download otherwise. */
export async function shareOrDownloadPng(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] })
      return
    } catch {
      /* Cancelled or refused; the download below still works. */
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
