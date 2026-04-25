// Calculates the final points for a confirmed metro session.
//
// Formula:
//   basePoints    = floor(durationMinutes * confidenceMultiplier)
//   afterTimeMods = applyMultiplyMods(basePoints) → applySubtractMods(...)
//   finalPoints   = afterTimeMods + stationBonuses
//   clamped       = clamp(finalPoints, 0, dailyRemaining)
//
// Individual points also accumulate to the player's clan total for the week.

import { confidenceMultiplier } from '../route-matching/confidence.js'
import { getActiveModifiers } from '../events/modifiers/modifier-registry.js'

const DAILY_LIMIT = 120
const WEEKLY_LIMIT = 600
const MIN_DURATION_MINUTES = 5
const MIN_STATIONS = 2

export function calculateSessionScore(session, context = {}) {
  const { durationSeconds, confidence, stations = [], startTimestamp } = session

  if (durationSeconds / 60 < MIN_DURATION_MINUTES) return 0
  if (stations.length < MIN_STATIONS) return 0

  const confMult = confidenceMultiplier(confidence)
  if (confMult === 0) return 0

  const basePoints = Math.floor((durationSeconds / 60) * confMult)
  const activeModifiers = getActiveModifiers(startTimestamp, stations)

  // Phase 1: multiply-phase modifiers (BONIFICATION_DAY, RUSH_HOUR) — applied in order
  let points = basePoints
  for (const mod of activeModifiers.filter(m => m.phase === 'multiply')) {
    points = mod.apply(points, session, context)
  }

  // Phase 2: subtract-phase modifiers (PICKPOCKET)
  for (const mod of activeModifiers.filter(m => m.phase === 'subtract')) {
    points = mod.apply(points, session, context)
  }

  // Phase 3: add-phase modifiers (STATION_BONUS) — additive, independent of above
  let addBonus = 0
  for (const mod of activeModifiers.filter(m => m.phase === 'add')) {
    addBonus += mod.apply(0, session, context)
  }

  const raw = points + addBonus
  const remaining = context.dailyRemaining ?? DAILY_LIMIT
  return Math.max(0, Math.min(raw, remaining))
}

// Track and enforce per-player daily/weekly caps.
// Returns { points, newDailyTotal, newWeeklyTotal }
export function applyScoreCaps(rawPoints, { dailyTotal = 0, weeklyTotal = 0 } = {}) {
  const dailyRoom = Math.max(0, DAILY_LIMIT - dailyTotal)
  const weeklyRoom = Math.max(0, WEEKLY_LIMIT - weeklyTotal)
  const points = Math.min(rawPoints, dailyRoom, weeklyRoom)
  return {
    points,
    newDailyTotal: dailyTotal + points,
    newWeeklyTotal: weeklyTotal + points
  }
}
