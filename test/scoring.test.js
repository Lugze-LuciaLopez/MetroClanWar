import test from 'brittle'
import { calculateSessionScore, applyScoreCaps } from '../core/scoring/score-calculator.js'
import { buildWeeklyRanking, clanRanking, getLeastActivePlayers } from '../core/scoring/ranking.js'
import { weekId } from '../core/weekly-engine/week-utils.js'
import { setBonusDays, clearBonusDays } from '../core/events/modifiers/bonification-day.js'
import { setWindows, clearWindows } from '../core/events/modifiers/pickpocket.js'
import { setStationBonuses, clearStationBonuses } from '../core/events/modifiers/station-bonus.js'

const BASE_SESSION = {
  durationSeconds: 600,   // 10 minutes
  confidence: 0.85,
  stations: ['FONTANA', 'GRACIA', 'LESSEPS'],
  startTimestamp: 1714000000  // some fixed timestamp (non rush-hour, non bonus day)
}

// ── calculateSessionScore ─────────────────────────────────────────────────────
test('score: basic session 10 min at 0.85 confidence → 1.2x multiplier', t => {
  clearBonusDays(); clearWindows(); clearStationBonuses()
  const pts = calculateSessionScore(BASE_SESSION)
  // floor(10 * 1.2) = 12
  t.is(pts, 12)
})

test('score: session below min duration returns 0', t => {
  const pts = calculateSessionScore({ ...BASE_SESSION, durationSeconds: 240 })  // 4 min
  t.is(pts, 0)
})

test('score: session with < 2 stations returns 0', t => {
  const pts = calculateSessionScore({ ...BASE_SESSION, stations: ['FONTANA'] })
  t.is(pts, 0)
})

test('score: confidence < 0.30 returns 0', t => {
  const pts = calculateSessionScore({ ...BASE_SESSION, confidence: 0.25 })
  t.is(pts, 0)
})

test('score: BONIFICATION_DAY doubles points', t => {
  clearWindows(); clearStationBonuses()
  const date = new Date(BASE_SESSION.startTimestamp * 1000).toISOString().slice(0, 10)
  setBonusDays([{ date, multiplier: 2 }])
  const pts = calculateSessionScore(BASE_SESSION)
  clearBonusDays()
  // floor(10 * 1.2) = 12 → bonification floor(12 * 2) = 24
  t.is(pts, 24)
})

test('score: PICKPOCKET deducts from session', t => {
  clearBonusDays(); clearStationBonuses()
  const ts = BASE_SESSION.startTimestamp
  setWindows([{ startTimestamp: ts - 100, endTimestamp: ts + 100, penalty: 5 }])
  const pts = calculateSessionScore(BASE_SESSION)
  clearWindows()
  // 12 - 5 = 7
  t.is(pts, 7)
})

test('score: STATION_BONUS adds flat bonus', t => {
  clearBonusDays(); clearWindows()
  setStationBonuses([{ stationId: 'GRACIA', points: 8 }])
  const pts = calculateSessionScore(BASE_SESSION)
  clearStationBonuses()
  // 12 + 8 = 20
  t.is(pts, 20)
})

// ── applyScoreCaps ────────────────────────────────────────────────────────────
test('applyScoreCaps respects daily limit', t => {
  const result = applyScoreCaps(30, { dailyTotal: 100, weeklyTotal: 100 })
  t.is(result.points, 20)  // only 20 left in day
})

test('applyScoreCaps respects weekly limit', t => {
  const result = applyScoreCaps(100, { dailyTotal: 0, weeklyTotal: 550 })
  t.is(result.points, 50)  // only 50 left in week
})

// ── buildWeeklyRanking ────────────────────────────────────────────────────────
test('buildWeeklyRanking aggregates correctly', t => {
  const ts = 1714000000
  const wid = weekId(ts)
  const events = [
    { playerId: 'p1', weekId: wid, payload: { points: 30, clanId: 'L3' } },
    { playerId: 'p1', weekId: wid, payload: { points: 20, clanId: 'L3' } },
    { playerId: 'p2', weekId: wid, payload: { points: 15, clanId: 'L4' } }
  ]
  const { playerScores, clanScores } = buildWeeklyRanking(events)
  t.is(playerScores.p1[wid], 50)
  t.is(playerScores.p2[wid], 15)
  t.is(clanScores.L3[wid], 50)
  t.is(clanScores.L4[wid], 15)
})

test('clanRanking sorts descending', t => {
  const wid = '2026-W17'
  const scores = { L3: { [wid]: 200 }, L1: { [wid]: 350 }, L4: { [wid]: 100 } }
  const ranking = clanRanking(scores, wid)
  t.is(ranking[0].clanId, 'L1')
  t.is(ranking[1].clanId, 'L3')
  t.is(ranking[2].clanId, 'L4')
})

// ── getLeastActivePlayers ─────────────────────────────────────────────────────
test('getLeastActivePlayers is deterministic', t => {
  const wid = '2026-W17'
  const players = [
    { playerId: 'aaa', weekScores: { [wid]: 50 }, weekSessions: { [wid]: 5 }, activeDays: { [wid]: 3 } },
    { playerId: 'bbb', weekScores: { [wid]: 10 }, weekSessions: { [wid]: 1 }, activeDays: { [wid]: 1 } },
    { playerId: 'ccc', weekScores: { [wid]: 80 }, weekSessions: { [wid]: 8 }, activeDays: { [wid]: 5 } },
    { playerId: 'ddd', weekScores: { [wid]: 10 }, weekSessions: { [wid]: 1 }, activeDays: { [wid]: 1 } }
  ]
  const least = getLeastActivePlayers(players, wid, 0.5)
  t.is(least.length, 2)
  // bbb and ddd tied on points/sessions/days → sorted by playerId: bbb < ddd
  t.is(least[0].playerId, 'bbb')
  t.is(least[1].playerId, 'ddd')
})
