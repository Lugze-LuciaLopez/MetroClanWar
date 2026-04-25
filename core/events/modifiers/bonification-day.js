// Bonification Day: a multiplier applied to all sessions on a specific calendar day.
// Days are set externally (e.g. validator announces a bonus day each week).

let bonusDays = []  // [{ date: 'YYYY-MM-DD', multiplier: 1.5 }]

export function setBonusDays(days) { bonusDays = days }
export function clearBonusDays() { bonusDays = [] }

function toDateString(timestamp) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10)
}

export default {
  type: 'BONIFICATION_DAY',
  scope: 'time',
  phase: 'multiply',

  isActive(startTimestamp) {
    const date = toDateString(startTimestamp)
    return bonusDays.some(d => d.date === date)
  },

  apply(points, session) {
    const date = toDateString(session.startTimestamp)
    const day = bonusDays.find(d => d.date === date)
    const multiplier = day?.multiplier ?? 1
    return Math.floor(points * multiplier)
  }
}
