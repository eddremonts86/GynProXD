# Plan: Generative Onboarding → Realistic Periodized Program (Forma)

- **Date:** 2026-08-23
- **Status:** draft — awaiting approval to build
- **Scope:** local-first, no backend, no LLM required (deterministic). Optional on-device LLM later.
- **Renamed app:** Forma (Noir Warm)

## 1. Objective

A new user arrives, says 4–6 small things (free text + structured fallback), and receives a **realistic** `mensual / trimestral / semestral / anual` plan. The system must **reject unrealistic timelines** (e.g., 140kg → 80kg in 1 mes) and compute an estimated `meses necesarios` based on goal + esfuerzo (horas/semana + intensidad), then generate a periodized calendar and sync to `Planner`.

Example from Edd:
> "hombre 40 años, 3×/semana 2h/día, 140kg → 80kg, adelgazar"
> Expected: estimate ~15–18 meses at 0.8–1.0 kg/sem (safe), propose 3× semestral blocks (or 6× trimestral) with milestones, not a 1-month miracle.

## 2. Inputs (minimal + extended)

**Minimal onboarding (4–6 utterances):**
1. `goal` — adelgazar | ganar músculo | recomposición | fuerza | general | híbrido
2. `level` — principiante | intermedio | avanzado
3. `effort` — escala 1–5 → maps to horas + intensidad (RPE)
4. `availability` — días/semana (1–6) + minutos/sesión (30–120) — *derived from utterence "3 veces 2h"*
5. `bio` — edad, sexo, peso actual, peso objetivo, altura (for BMI/TDEE sanity)
6. `equipment` — gym | casa | calistenia | híbrido (default híbrido)
7. `constraints` — lesiones/limitaciones (optional free text)

**Capture modes:**
- **A. Natural language** — single textarea: "soy hombre 40 años..." → regex/LLM-lite parser extracts fields.
- **B. Structured fallback** — 6 stepper inputs if parsing low-confidence.

**Effort mapping (ambas):**
- `effort 1` = 2h/sem, RPE 6, progression `none`
- `effort 3` = 5h/sem, RPE 7–8, `linear`
- `effort 5` = 8–10h/sem, RPE 8–9, `double` + higher volume
Hours and RPE both tune volume (sets) and progression aggressiveness.

## 3. Estimation Engine (realistic timeline)

**Weight loss:**
- Safe rate = `0.5–1.0% bodyweight/sem` bounded 0.4–1.0 kg/sem.
- `effort` scales rate: 1→0.4, 3→0.7, 5→1.0 kg/sem. Age >45 −10%, >3 días/sem +0.1.
- `weeks_needed = ceil(delta_kg / rate)` → `months = ceil(weeks/4.3)`
- If user-requested duration < 0.7× estimated → flag unrealistic, propose estimated.

**Muscle gain:**
- Novice 0.25–0.5 kg/sem lean, intermediate 0.12–0.25, advanced 0.06–0.12. Effort scales within band.

**Strength:** estimate via volume, but primary output is program length, not weight delta.

**General/Hybrid:** use weight delta if provided else default 12-sem block.

**Safety:** if BMI target <18.5 or >40, or delta >30% in <12 sem, show disclaimer "no es consejo médico, consulta profesional" and cap rate.

**Output of estimation:**
- `estimatedMonths`, `estimatedWeeks`, `recommendedDurations: ['trimestral','semestral']` etc.
- `milestones: [{kg, week}, …]` for chart.

## 4. Generation Algorithm (periodized)

**Durations:**
- mensual = 4 sem, trimestral = 12, semestral = 24, anual = 52
- Generator picks closest to `estimatedWeeks` but respects user-requested duration if realistic; else proposes nearest realistic (e.g., user asks 1 mes for 60kg loss → propose 18 mes ≈ 3× semestral).

**Block structure (example for fat loss, 24 sem):**
- Base (sem 1–4): full-body 3×, low volume, technique + steps 8k
- Volumen (5–12): 4× upper/lower, caloric deficit, progression `linear`, 15% cardio
- Intensidad (13–20): 4×, `double` for compounds, HIIT 1×
- Deload (21): −40% volume
- Pico/Test (22–24): AMRAP test + re-estimate

For hypertrophy: mesocycles 4–6 sem + deload, double progression.

For 52 sem: 2–4 mesocycles × (3 sem load +1 deload).

**Exercise selection:**
- Pool = 873 public-domain + customs, filtered by `equipment` + `muscle` balance + `level` (beginner avoids barbell AMRAP).
- Ensure push/pull/legs balance, hybrid includes 40% bodyweight.

**Per-day output:**
```ts
GeneratedDay { date: string, day: DayOfWeek, exercises: PlannedExercise[] } // PlannedExercise {exerciseId, progression, targetSets, targetReps}
```

**Sync to Planner:**
- Collapse `GeneratedDay[]` into `WeeklyPlan` template (repeating week with progression). First week becomes Planner week 1, subsequent weeks are variations stored as `GeneratedPlan.weeks[]` for calendar.

## 5. Data Model (extends existing)

```ts
// src/lib/types.ts — add
interface OnboardingInput {
  age: number; sex: 'hombre'|'mujer'|'otro'; weightKg: number; targetWeightKg?: number; heightCm?: number
  goal: 'adelgazar'|'musculo'|'recomp'|'fuerza'|'general'|'hibrido'
  level: 'principiante'|'intermedio'|'avanzado'
  daysPerWeek: number; minsPerSession: number; equipment: Equipment| 'hibrido'; effort: 1|2|3|4|5
  constraints?: string
}
interface GeneratedPlan {
  id: string; createdAt: string
  input: OnboardingInput
  estimatedMonths: number; estimatedWeeks: number
  requestedDuration: 'mensual'|'trimestral'|'semestral'|'anual'
  approvedDuration: same
  weeks: { weekIndex: number; days: GeneratedDay[] }[] // for calendar
  weeklyTemplate: WeeklyPlan // for Planner sync
  milestones: { week: number; weight?: number; note: string }[]
}
```

Store `generatedPlans: GeneratedPlan[]` in Zustand persist `gynproxd-v2`.

## 6. UX Flow

1. **Entry** — CTA on `Today` empty + `Planner` header: "¿Eres nuevo? Genera tu plan en 30s"
2. **Onboarding** — `/onboarding` route: textarea natural + "o responde 6 pasos" stepper. Live parsing preview chips.
3. **Estimation** — card: "Objetivo 60kg → estimado 18 meses (0.8 kg/sem). Pediste 1 mes — no realista." Show `milestones` mini chart (Whoop warm). Buttons: "Aceptar 18 meses (semestral ×3)" / "Ajustar esfuerzo"
4. **Calendar** — `/plan/:id` calendar month/week toggle (mobile list, desktop grid), each day shows exercises + `Illustration plate`, progression badge, rest. Swipe weeks.
5. **Sync** — "Guardar en Planner" → creates/updates `WeeklyPlan` named "Forma · 18m · adelgazar". Toast + link to `/planner`.
6. **Iterate** — from calendar, "Regenerar semana" or "Cambiar esfuerzo" re-runs with same input but new seed.

All local, no network.

## 7. Verification

- Build/lint/test gates each commit
- Unit tests: `src/lib/plan-estimate.spec.ts` (60kg loss → 72–80 sem), `src/lib/plan-generator.spec.ts` (24 sem has 1 deload, 873 pool filtered)
- Playwright: onboarding free text "hombre 40 140→80 3×2h" → estimation card shows 16–20 meses, calendar has 24 sem, Planner receives template; mobile+desktop 375/1440
- PWA offline: generated plan readable offline

## 8. Out of scope (v1)

- Nutrition/macros, LLM cloud, medical diagnosis, social sharing
- Backend sync (future)

## 9. Build Steps (if approved)

1. Types + estimate engine + tests
2. Onboarding route + parser (regex first, LLM later) + estimation card
3. Generator + calendar + Planner sync
4. Polish (3D plate, warm chart, i18n ES) + final walk on 3010

## 10. Open Decision

- Confirm minimal 6-field set above vs even shorter? Current example proves need bio+availability, not just meta/nivel/esfuerzo.
- Confirm effort 1–5 scale is UX for "ambas" — or prefer separate sliders hours + RPE?

---
Prepared for `approval` — reply "go" to build step 1.
