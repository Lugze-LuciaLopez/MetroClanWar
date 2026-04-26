// Deterministic weekly ranking and invasion logic.
//
// The ranking is reproducible by any validator from the same set of SCORE_GRANTED
// events — no external state or randomness.

// Build weekly ranking from an array of SCORE_GRANTED event objects.
// Returns { playerScores, clanScores } keyed by weekId.
export function buildWeeklyRanking(scoreGrantedEvents) {
  const playerScores = {}  // { playerId: { weekId: totalPoints } }
  const clanScores = {}    // { clanId:   { weekId: totalPoints } }

  for (const event of scoreGrantedEvents) {
    const { playerId, weekId } = event
    const { points, clanId } = event.payload

    if (!playerScores[playerId]) playerScores[playerId] = {}
    playerScores[playerId][weekId] = (playerScores[playerId][weekId] ?? 0) + points

    if (!clanScores[clanId]) clanScores[clanId] = {}
    clanScores[clanId][weekId] = (clanScores[clanId][weekId] ?? 0) + points
  }

  return { playerScores, clanScores }
}

// All-time cumulative clan ranking from all SCORE_GRANTED events across all weeks.
// Applies upset-bonus transfers from INVASION_RESULT events (upsetBonus field).
export function buildGlobalRanking(allScoreEvents, invasionResults = []) {
  const totals = {}
  for (const e of allScoreEvents) {
    const { clanId, points } = e.payload
    if (!clanId) continue
    totals[clanId] = (totals[clanId] ?? 0) + points
  }
  for (const inv of invasionResults) {
    const b = inv.payload?.upsetBonus
    if (!b) continue
    totals[b.fromClanId] = (totals[b.fromClanId] ?? 0) - b.amount
    totals[b.toClanId]   = (totals[b.toClanId]   ?? 0) + b.amount
  }
  return Object.entries(totals)
    .map(([clanId, points]) => ({ clanId, points: Math.max(0, points) }))
    .sort((a, b) => b.points - a.points)
}

// Returns clans sorted by descending score for a given weekId.
export function clanRanking(clanScores, weekId) {
  return Object.entries(clanScores)
    .map(([clanId, weeks]) => ({ clanId, points: weeks[weekId] ?? 0 }))
    .sort((a, b) => b.points - a.points)
}

// Deterministic selection of the N least-active players in a clan for a week.
// Sort criteria (ascending — least active first):
//   1. total points (lowest first)
//   2. session count (fewest first)
//   3. active days (fewest first)
//   4. playerId lexicographic (tiebreaker — deterministic)
export function getLeastActivePlayers(players, weekId, percent = 0.25) {
  const sorted = [...players].sort((a, b) => {
    const aPoints = a.weekScores?.[weekId] ?? 0
    const bPoints = b.weekScores?.[weekId] ?? 0
    if (aPoints !== bPoints) return aPoints - bPoints

    const aSessions = a.weekSessions?.[weekId] ?? 0
    const bSessions = b.weekSessions?.[weekId] ?? 0
    if (aSessions !== bSessions) return aSessions - bSessions

    const aDays = a.activeDays?.[weekId] ?? 0
    const bDays = b.activeDays?.[weekId] ?? 0
    if (aDays !== bDays) return aDays - bDays

    return a.playerId.localeCompare(b.playerId)
  })

  const count = Math.max(1, Math.ceil(sorted.length * percent))
  return sorted.slice(0, count)
}
