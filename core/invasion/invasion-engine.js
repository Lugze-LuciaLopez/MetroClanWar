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

  // 1) Score for the war: only events on the defender's home line count.
  let attackerPoints = 0
  let defenderPoints = 0
  for (const ev of scoreGrantedEvents) {
    if (ev.weekId !== weekId) continue
    if (ev.payload?.lineId !== targetLineId) continue
    const clanId = ev.payload?.clanId
    const points = ev.payload?.points ?? 0
    if (clanId === attackerClanId) attackerPoints += points
    else if (clanId === defenderClanId) defenderPoints += points
  }

  // 2) Roster for transfer eligibility: any event of either war clan during
  //    the war week, regardless of which line it was on. This is what makes
  //    the "least active" semantic meaningful — a clan member who didn't
  //    attempt the invasion at all is still a candidate to be transferred,
  //    they just count as "0 score this week".
  const playerMap = {}
  for (const ev of scoreGrantedEvents) {
    if (ev.weekId !== weekId) continue
    const { clanId, points = 0 } = ev.payload ?? {}
    if (clanId !== attackerClanId && clanId !== defenderClanId) continue

    const pid = ev.playerId
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
