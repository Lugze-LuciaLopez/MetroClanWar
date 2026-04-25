// Generates realistic fake metro sessions for a given player.
// Uses actual station sequences from lines.json so route-matching works end-to-end.

import { EventType } from '../core/events/event-types.js'
import { matchSequence } from '../core/route-matching/sequence-matcher.js'
import { calculateConfidence } from '../core/route-matching/confidence.js'
import { calculateSessionScore, applyScoreCaps } from '../core/scoring/score-calculator.js'
import crypto from 'crypto'

const AVG_SECONDS_PER_STATION = 90  // ~26 km/h average

// Creates a session event pair (METRO_SESSION_CONFIRMED + SCORE_GRANTED)
// for a player travelling along a slice of a line.
export function simulateSession({
  player,
  lineId,
  lineStations,        // full ordered station list for the line
  startIdx = 0,
  stationCount = 6,
  startTimestamp,
  linesData,           // full lines.json (for route matching)
  caps = { dailyTotal: 0, weeklyTotal: 0 }
}) {
  const end = Math.min(startIdx + stationCount, lineStations.length)
  const stations = lineStations.slice(startIdx, end)
  const duration = (stations.length - 1) * AVG_SECONDS_PER_STATION
  const endTimestamp = startTimestamp + duration

  // Simulate a few missed detections (drop 1 station randomly for realism)
  const detected = stations.filter((_, i) => i === 0 || i === stations.length - 1 || Math.random() > 0.15)

  const match = matchSequence(detected, linesData)
  const gpsAccuracy = 35 + Math.random() * 40  // 35–75m
  const confidence = calculateConfidence({
    gpsAccuracyMeters: gpsAccuracy,
    maxSpeedKmh: 28 + Math.random() * 8,
    gaps: match?.gaps ?? 0,
    coverage: match?.coverage ?? 0.8
  })

  const sessionId = crypto.createHash('sha256')
    .update(`${player.playerId}-${startTimestamp}`)
    .digest('hex')
    .slice(0, 32)

  const confirmed = player.makeEvent(EventType.METRO_SESSION_CONFIRMED, {
    sessionId,
    lineId: match?.lineId ?? lineId,
    stations,
    startTimestamp,
    endTimestamp,
    durationSeconds: duration,
    confidence
  }, endTimestamp)

  const rawPoints = calculateSessionScore({
    durationSeconds: duration,
    confidence,
    stations,
    startTimestamp
  })
  const { points, newDailyTotal, newWeeklyTotal } = applyScoreCaps(rawPoints, caps)

  const score = player.makeEvent(EventType.SCORE_GRANTED, {
    sessionId,
    lineId: match?.lineId ?? lineId,
    clanId: player.clanId,
    points,
    reason: 'VALIDATED_METRO_SESSION'
  }, endTimestamp + 5)

  return {
    confirmed,
    score,
    points,
    newCaps: { dailyTotal: newDailyTotal, weeklyTotal: newWeeklyTotal }
  }
}
