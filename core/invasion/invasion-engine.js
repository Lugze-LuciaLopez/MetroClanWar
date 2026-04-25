import { getLeastActivePlayers } from '../scoring/ranking.js'

// Computes the result of an invasion for a given week.
//
// The battle is fought on the DEFENDER's home line (targetLineId = defenderClanId).
// Only SCORE_GRANTED events on that line, from either clan, count.
// Tiebreak: defender wins (home advantage).
//
// Returns:
//   { winner, attackerClanId, defenderClanId, targetLineId,
//     attackerPoints, defenderPoints, membersToTransfer: [playerId, ...] }
export function computeInvasionResult({
  scoreGrantedEvents,
  attackerClanId,
  defenderClanId,
  weekId
}) {
  const targetLineId = defenderClanId

  const relevant = scoreGrantedEvents.filter(e =>
    e.weekId === weekId &&
    e.payload?.lineId === targetLineId &&
    (e.payload?.clanId === attackerClanId || e.payload?.clanId === defenderClanId)
  )

  let attackerPoints = 0
  let defenderPoints = 0
  const playerMap = {}

  for (const ev of relevant) {
    const { clanId, points } = ev.payload
    const pid = ev.playerId

    if (clanId === attackerClanId) attackerPoints += points
    else defenderPoints += points

    if (!playerMap[pid]) {
      playerMap[pid] = {
        playerId: pid,
        clanId,
        weekScores: {},
        weekSessions: {},
        _days: new Set(),
        activeDays: {}
      }
    }
    const p = playerMap[pid]
    p.weekScores[weekId] = (p.weekScores[weekId] ?? 0) + points
    p.weekSessions[weekId] = (p.weekSessions[weekId] ?? 0) + 1
    p._days.add(Math.floor(ev.timestamp / 86400))
    p.activeDays[weekId] = p._days.size
  }

  // Defender wins on tie (home advantage)
  const winner = attackerPoints > defenderPoints ? 'ATTACKER' : 'DEFENDER'
  const loserClanId = winner === 'ATTACKER' ? defenderClanId : attackerClanId
  const loserPlayers = Object.values(playerMap).filter(p => p.clanId === loserClanId)
  const membersToTransfer = getLeastActivePlayers(loserPlayers, weekId, 0.05).map(p => p.playerId)

  return {
    winner,
    attackerClanId,
    defenderClanId,
    targetLineId,
    attackerPoints,
    defenderPoints,
    membersToTransfer
  }
}
